/**
 * XBRL Fact 선택 로직
 * 연결(Consolidated) 우선, dimension 최소, 올바른 Fact만 선택
 */

import { dlog } from '@/lib/utils/debug'

export interface XBRLElementWithContext {
  element: Element
  contextRef: string | null
  tagName: string
  localName: string
  value: number
  unit: string
  score: number // 스코어링 점수
}

/**
 * Fact 스코어링 기준
 */
export function scoreFact(
  element: Element,
  xmlDoc: Document,
  contextRef: string | null
): number {
  let score = 0
  
  if (!contextRef) {
    return 0 // contextRef가 없으면 점수 0 (최우선 아님)
  }
  
  // Context 요소 찾기 (네임스페이스 독립)
  let contextElement: Element | null = null
  try {
    const allContexts = xmlDoc.getElementsByTagNameNS('*', 'context')
    for (let i = 0; i < allContexts.length; i++) {
      const ctx = allContexts[i]
      if (ctx.getAttribute('id') === contextRef) {
        contextElement = ctx
        break
      }
    }
  } catch (error) {
    console.warn('[XBRL Fact Selector] context 요소 찾기 실패:', error)
    return 0
  }
  
  if (!contextElement) {
    return 0
  }
  
  // 1. 세그먼트/축(axis) 포함 체크 - 강한 감점 (-1000) (네임스페이스 독립)
  let explicitMembers: Element[] = []
  let typedMembers: Element[] = []
  try {
    explicitMembers = Array.from(contextElement.getElementsByTagNameNS('*', 'explicitMember'))
    typedMembers = Array.from(contextElement.getElementsByTagNameNS('*', 'typedMember'))
  } catch (error) {
    console.warn('[XBRL Fact Selector] explicitMember/typedMember 찾기 실패:', error)
  }
  const allMembers = Array.from(explicitMembers).concat(Array.from(typedMembers))
  
  // 실제 세그먼트 축만 판정 (과도한 'axis' 키워드 제거로 정상 구조 축 보호)
  const segmentKeywords = [
    'segment', 'segments', 'operatingsegments', 'businesssegment', 'geographicalsegment',
    'productsandservicessegment', 'reportablesegment', 'lineofbusiness', 'region'
  ]
  
  const hasSegment = allMembers.some(member => {
    const memberText = (member.textContent || '').toLowerCase()
    const dimension = member.getAttribute('dimension') || ''
    const dimensionLower = dimension.toLowerCase()
    
    return segmentKeywords.some(keyword => 
      memberText.includes(keyword) || dimensionLower.includes(keyword)
    )
  })

  if (hasSegment) {
    score -= 1000 // 기본적으로 배제
    return score // 세그먼트 포함이면 더 이상 점수 계산하지 않음
  }
  
  // DiscontinuedOperationsMember, NoncontrollingInterestsMember 등 비정상 컨텍스트 강한 패널티
  const excludedMemberKeywords = [
    'discontinuedoperationsmember',
    'discontinuedoperations',
    'noncontrollinginterestsmember',
    'noncontrollinginterests',
    'discontinued',
  ]
  
  const hasExcludedMember = allMembers.some(member => {
    const memberText = (member.textContent || '').toLowerCase()
    const dimension = member.getAttribute('dimension') || ''
    const dimensionLower = dimension.toLowerCase()
    
    return excludedMemberKeywords.some(keyword => 
      memberText.includes(keyword) || dimensionLower.includes(keyword)
    )
  })
  
  if (hasExcludedMember) {
    score -= 1500 // DiscontinuedOperationsMember 등은 세그먼트보다 더 강한 패널티
    return score // 비정상 멤버 포함이면 더 이상 점수 계산하지 않음
  }
  
  // 2. 연결(Consolidated) vs 별도(Separate) 체크
  const memberTexts = Array.from(explicitMembers).map(m => (m.textContent || '').toLowerCase())
  const dimensionAttrs = Array.from(explicitMembers).map(m => (m.getAttribute('dimension') || '').toLowerCase())
  
  const hasConsolidated = memberTexts.some(text => 
    text.includes('consolidatedmember') || 
    text.includes('consolidated') ||
    text === 'consolidated'
  ) || dimensionAttrs.some(dim => 
    dim.includes('consolidatedmember') || 
    dim.includes('consolidated')
  )

  const hasSeparate = memberTexts.some(text => 
    text.includes('separatemember') || 
    text.includes('separate') ||
    text === 'separate'
  ) || dimensionAttrs.some(dim => 
    dim.includes('separatemember') || 
    dim.includes('separate')
  )

  // dimension이 전혀 없는 경우도 연결로 추정
  const hasNoDimensions = explicitMembers.length === 0 && typedMembers.length === 0

  if (hasConsolidated || hasNoDimensions) {
    score += 50 // 연결 보너스
  } else if (hasSeparate) {
    score -= 50 // 별도 감점 (또는 제외 가능)
  } else if (explicitMembers.length <= 1) {
    // 불명확하지만 dimension이 적으면 연결 가능성 높음
    score += 30
  }
  
  // 3. Dimension 개수 (적을수록 좋음)
  const dimensionCount = explicitMembers.length + typedMembers.length
  if (dimensionCount === 0) {
    score += 20
  } else if (dimensionCount > 2) {
    score -= 10 * dimensionCount
  }
  
  // 4. 제외해야 할 멤버 포함 시 점수 차감 (DiscontinuedOperationsMember는 이미 위에서 처리됨)
  const excludedKeywords = [
    'relatedparty', // 관계자 거래
    'majorcustomer', // 주요고객
  ]
  
  for (const keyword of excludedKeywords) {
    if (memberTexts.some(text => text.includes(keyword))) {
      score -= 500 // 차감 강화 (관계자 거래, 주요고객 등도 강한 패널티)
    }
  }
  
  // 4. 기간 타입 우선순위: duration > instant (손익/현금흐름 vs 재무상태) (네임스페이스 독립)
  try {
    const periods = contextElement.getElementsByTagNameNS('*', 'period')
    if (periods.length > 0) {
      const period = periods[0]
      const startDates = period.getElementsByTagNameNS('*', 'startDate')
      const endDates = period.getElementsByTagNameNS('*', 'endDate')
      const instants = period.getElementsByTagNameNS('*', 'instant')
      
      if (endDates.length > 0 && startDates.length > 0) {
        score += 100 // duration context (손익/현금흐름)
      } else if (instants.length > 0) {
        score += 50 // instant context (재무상태)
      }
    }
  } catch (error) {
    console.warn('[XBRL Fact Selector] period 요소 찾기 실패:', error)
  }
  
  return score
}

/**
 * 여러 후보 중 최적 Fact 선택
 * @param candidates 후보 Fact 배열
 * @param xmlDoc XML 문서
 * @param contextDimCount contextRef별 차원 수 Map (선택적, 차원 수 기반 선택 보완용)
 */
export function selectBestFact(
  candidates: Array<{ element: Element; contextRef: string | null; value: number; unit: string; dimCount?: number; dimBonus?: number }>,
  xmlDoc: Document,
  contextDimCount?: Map<string, number>
): { element: Element; contextRef: string | null; value: number; unit: string } | null {
  if (candidates.length === 0) {
    return null
  }
  
  if (candidates.length === 1) {
    return candidates[0]
  }
  
  // 각 후보에 점수 부여
  const scoredCandidates = candidates.map(candidate => {
    let score = scoreFact(candidate.element, xmlDoc, candidate.contextRef);
    
    // 차원 수 보너스가 이미 계산되어 있으면 추가 (xbrl-parser.ts에서 전달된 경우)
    if (candidate.dimBonus !== undefined) {
      score += candidate.dimBonus;
    } else if (contextDimCount && candidate.contextRef) {
      // 차원 수 Map이 제공되면 여기서 계산
      const dimCount = contextDimCount.get(candidate.contextRef) ?? Infinity;
      const dimBonus = dimCount === 0 ? 100 : dimCount === 1 ? 50 : dimCount === 2 ? 25 : -10 * (dimCount - 2);
      score += dimBonus;
    }
    
    return {
      ...candidate,
      score,
    };
  })
  
  // 점수 순으로 정렬 (높은 점수 우선)
  scoredCandidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 5) {
      // 점수 차이가 크면 점수 우선
      return b.score - a.score;
    }
    // 점수가 비슷하면 차원 수가 적은 것이 우선
    const aDim = a.dimCount ?? (contextDimCount && a.contextRef ? (contextDimCount.get(a.contextRef) ?? Infinity) : Infinity);
    const bDim = b.dimCount ?? (contextDimCount && b.contextRef ? (contextDimCount.get(b.contextRef) ?? Infinity) : Infinity);
    if (aDim !== bDim) {
      return aDim - bDim;
    }
    // 차원 수도 같으면 값이 큰 것이 우선 (재무제표 라인아이템은 보통 큰 값)
    return Math.abs(b.value) - Math.abs(a.value);
  })
  
  const best = scoredCandidates[0]
  
  // 최고 점수가 너무 낮으면 (제외 키워드가 포함된 경우) null 반환
  if (best.score < -1000) {
    console.warn(`[XBRL Fact Selector] 모든 후보가 제외 키워드를 포함하여 Fact 선택 실패`)
    return null
  }
  
  const bestDimCount = best.dimCount ?? (contextDimCount && best.contextRef ? (contextDimCount.get(best.contextRef) ?? 'unknown') : 'unknown');
  dlog(`[XBRL Fact Selector] 최적 Fact 선택: 점수=${best.score}, contextRef=${best.contextRef}, 차원수=${bestDimCount}, value=${best.value}`)
  
  return best
}
