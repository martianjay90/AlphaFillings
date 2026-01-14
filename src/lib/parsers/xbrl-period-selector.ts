/**
 * XBRL 기간 선택 로직
 * 최신 CFY 우선, Q vs YTD 구분
 */

import { dlog } from '@/lib/utils/debug'

export interface PeriodInfo {
  contextRef: string
  periodType: 'FY' | 'Q' | 'YTD'
  periodTypeLabel?: string // "Q3(3M)", "9M(YTD)" 등 UI 표시용
  startDate?: string // ISO 8601: YYYY-MM-DD
  endDate: string // ISO 8601: YYYY-MM-DD
  instant?: string // ISO 8601: YYYY-MM-DD (재무상태표용)
  fiscalYear?: number
  quarter?: number
  // 컨텍스트 스코어링 정보
  isConsolidated?: boolean // 연결 여부
  isSeparate?: boolean // 별도 여부
  hasSegmentOrAxis?: boolean // 세그먼트/축 포함 여부
  dimensionCount?: number // dimension 개수
}

/**
 * Context에서 기간 정보 추출 (네임스페이스 독립)
 */
export function extractPeriodInfo(xmlDoc: Document, contextRef: string): PeriodInfo | null {
  // 네임스페이스 독립: getElementsByTagNameNS 사용
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
    console.warn('[XBRL Period Selector] context 요소 찾기 실패:', error)
    return null
  }
  
  if (!contextElement) {
    return null
  }
  
  // period 요소 찾기 (네임스페이스 독립)
  let period: Element | null = null
  try {
    const periods = contextElement.getElementsByTagNameNS('*', 'period')
    if (periods.length > 0) {
      period = periods[0]
    }
  } catch (error) {
    console.warn('[XBRL Period Selector] period 요소 찾기 실패:', error)
    return null
  }
  
  if (!period) {
    return null
  }
  
  // startDate, endDate, instant 추출 (네임스페이스 독립)
  let startDate: string | undefined
  let endDate: string | undefined
  let instant: string | undefined
  
  try {
    const startDates = period.getElementsByTagNameNS('*', 'startDate')
    if (startDates.length > 0 && startDates[0].textContent) {
      startDate = startDates[0].textContent.trim()
    }
    
    const endDates = period.getElementsByTagNameNS('*', 'endDate')
    if (endDates.length > 0 && endDates[0].textContent) {
      endDate = endDates[0].textContent.trim()
    }
    
    const instants = period.getElementsByTagNameNS('*', 'instant')
    if (instants.length > 0 && instants[0].textContent) {
      instant = instants[0].textContent.trim()
    }
  } catch (error) {
    console.warn('[XBRL Period Selector] 기간 날짜 추출 실패:', error)
    return null
  }
  
  let periodType: 'FY' | 'Q' | 'YTD' = 'FY'
  let fiscalYear: number | undefined
  let quarter: number | undefined
  
  if (instant) {
    // 재무상태표: instant context
    periodType = 'FY'
    const instantDate = new Date(instant)
    fiscalYear = instantDate.getFullYear()
  } else if (startDate && endDate) {
    // 손익/현금흐름: duration context
    const start = new Date(startDate)
    const end = new Date(endDate)
    
    fiscalYear = end.getFullYear()
    
    // startDate가 YYYY-01-01 형식인지 확인 (연도의 첫 날)
    const startYear = start.getFullYear()
    const startMonth = start.getMonth() + 1 // 1-12
    const startDay = start.getDate()
    const endMonth = end.getMonth() + 1 // 1-12
    const endDay = end.getDate()
    
    // YTD 판별: startDate가 YYYY-01-01이면 누적(YTD)
    const isYearStart = startMonth === 1 && startDay === 1 && startYear === fiscalYear
    
    if (isYearStart) {
      // 누적(YTD): 1/1부터 특정 월 말까지
      periodType = 'YTD'
      if (endMonth === 3 && endDay === 31) quarter = 1 // Q1 누적: 1/1-3/31 (3M)
      else if (endMonth === 6 && endDay === 30) quarter = 2 // Q2 누적: 1/1-6/30 (6M)
      else if (endMonth === 9 && endDay === 30) quarter = 3 // Q3 누적: 1/1-9/30 (9M)
      else if (endMonth === 12 && endDay === 31) quarter = 4 // Q4 누적: 1/1-12/31 (12M = 연간)
      else {
        // 정확한 분기 말일이 아니어도 YTD로 판별 (예: 9/30)
        quarter = Math.ceil(endMonth / 3)
      }
    } else {
      // 분기(Q): 분기 시작일부터 분기 말일까지 (3개월)
      if (
        (startMonth === 1 && startDay === 1 && endMonth === 3 && endDay === 31) || // Q1: 1/1-3/31 (3M)
        (startMonth === 4 && startDay === 1 && endMonth === 6 && endDay === 30) || // Q2: 4/1-6/30 (3M)
        (startMonth === 7 && startDay === 1 && endMonth === 9 && endDay === 30) || // Q3: 7/1-9/30 (3M)
        (startMonth === 10 && startDay === 1 && endMonth === 12 && endDay === 31)  // Q4: 10/1-12/31 (3M)
      ) {
        periodType = 'Q'
        if (startMonth === 1) quarter = 1
        else if (startMonth === 4) quarter = 2
        else if (startMonth === 7) quarter = 3
        else if (startMonth === 10) quarter = 4
      } else if (startMonth === 1 && startDay === 1 && endMonth === 12 && endDay === 31) {
        // 연간(FY): 1/1-12/31
        periodType = 'FY'
        quarter = 4
      } else {
        // 기타: 기본적으로 연간으로 처리
        periodType = 'FY'
      }
    }
  } else {
    return null
  }
  
  // periodTypeLabel 생성 (UI 표시용)
  let periodTypeLabel: string | undefined
  if (periodType === 'Q' && quarter) {
    periodTypeLabel = `Q${quarter}(3M)` // 분기: Q3(3M)
  } else if (periodType === 'YTD' && quarter) {
    if (quarter === 1) periodTypeLabel = '3M(YTD)'
    else if (quarter === 2) periodTypeLabel = '6M(YTD)'
    else if (quarter === 3) periodTypeLabel = '9M(YTD)' // 요구사항: "9M(YTD)" 형식
    else if (quarter === 4) periodTypeLabel = '12M(YTD)'
    else periodTypeLabel = 'YTD'
  } else if (periodType === 'FY') {
    periodTypeLabel = 'FY'
  }
  
  return {
    contextRef,
    periodType,
    periodTypeLabel,
    startDate,
    endDate: endDate || instant || '',
    instant,
    fiscalYear,
    quarter,
  }
}

/**
 * 최신 CFY 기간 선택 (endDate/instant가 가장 최신인 것)
 * @param periodInfos 기간 정보 배열
 * @param preferredType 우선 선택할 기간 타입 ('Q' | 'YTD' | 'FY', 기본값: 'YTD')
 * @returns 최신 기간 정보
 */
export function selectLatestCFYPeriod(
  periodInfos: PeriodInfo[],
  preferredType: 'Q' | 'YTD' | 'FY' = 'YTD'
): PeriodInfo | null {
  if (periodInfos.length === 0) {
    return null
  }
  
  // endDate 또는 instant 기준으로 정렬 (최신 순)
  const sorted = [...periodInfos].sort((a, b) => {
    const dateA = a.endDate || a.instant || ''
    const dateB = b.endDate || b.instant || ''
    return dateB.localeCompare(dateA) // 내림차순 (최신이 앞)
  })
  
  // 최신 날짜
  const latestDate = sorted[0].endDate || sorted[0].instant
  
  // 같은 날짜 중에서 preferredType 우선 선택
  const sameDatePeriods = sorted.filter(p => 
    (p.endDate || p.instant) === latestDate
  )
  
  // preferredType이 있으면 우선 선택
  const preferredPeriod = sameDatePeriods.find(p => p.periodType === preferredType)
  if (preferredPeriod) {
    return preferredPeriod
  }
  
  // 없으면 가장 최신 것 반환
  return sorted[0]
}

/**
 * 컨텍스트 스코어링 점수 계산
 */
export interface ContextScore {
  contextRef: string
  score: number
  periodInfo: PeriodInfo
  reason: string[] // 점수 계산 사유
}

export function scoreContextRef(
  contextRef: string,
  xmlDoc: Document,
  fieldType: 'income' | 'cashflow' | 'balance',
  preferredPeriodType?: 'Q' | 'YTD' | 'FY',
  reportEndDate?: string // 보고서 기준 종료일 (예: "2025-09-30")
): ContextScore | null {
  const periodInfo = extractPeriodInfo(xmlDoc, contextRef)
  if (!periodInfo) {
    return null
  }

  let score = 0
  const reasons: string[] = []

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
    console.warn('[XBRL Period Selector] context 요소 찾기 실패:', error)
    return null
  }
  
  if (!contextElement) {
    return null
  }

  // 1. 세그먼트/축(axis) 포함 체크 - 강한 감점 (-1000) (네임스페이스 독립)
  let explicitMembers: Element[] = []
  let typedMembers: Element[] = []
  try {
    explicitMembers = Array.from(contextElement.getElementsByTagNameNS('*', 'explicitMember'))
    typedMembers = Array.from(contextElement.getElementsByTagNameNS('*', 'typedMember'))
  } catch (error) {
    console.warn('[XBRL Period Selector] explicitMember/typedMember 찾기 실패:', error)
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
    score -= 1000
    reasons.push('세그먼트 포함 (-1000)')
    periodInfo.hasSegmentOrAxis = true
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
    reasons.push('DiscontinuedOperationsMember/NoncontrollingInterestsMember 포함 (-1500)')
    periodInfo.hasSegmentOrAxis = true
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

  // dimension이 전혀 없는 경우도 연결로 추정 (일반적으로 연결 재무제표는 dimension 없음)
  const hasNoDimensions = explicitMembers.length === 0 && typedMembers.length === 0

  if (hasConsolidated || hasNoDimensions) {
    score += 50
    reasons.push('연결(Consolidated) 추정 (+50)')
    periodInfo.isConsolidated = true
    periodInfo.isSeparate = false
  } else if (hasSeparate) {
    score -= 50
    reasons.push('별도(Separate) 추정 (-50)')
    periodInfo.isConsolidated = false
    periodInfo.isSeparate = true
  } else {
    // 불명확한 경우 연결로 추정 (dimension이 적으면 연결일 가능성 높음)
    if (explicitMembers.length <= 1) {
      score += 30
      reasons.push('연결 가능성 높음 (+30)')
      periodInfo.isConsolidated = true
    }
  }

  // 3. dimension 개수 (적을수록 좋음)
  const dimensionCount = explicitMembers.length + typedMembers.length
  periodInfo.dimensionCount = dimensionCount
  if (dimensionCount === 0) {
    score += 20
    reasons.push('dimension 없음 (연결 가능성) (+20)')
  } else if (dimensionCount > 2) {
    score -= 10 * dimensionCount
    reasons.push(`dimension 개수 많음 (${dimensionCount}개, -${10 * dimensionCount})`)
  }

  // 4. 기간 타입 일치 체크
  const targetPeriodType = preferredPeriodType || (fieldType === 'balance' ? 'FY' : 'YTD')
  if (periodInfo.periodType === targetPeriodType) {
    score += 30
    reasons.push(`기간 타입 일치 (${targetPeriodType}, +30)`)
  } else {
    score -= 30
    reasons.push(`기간 타입 불일치 (기대: ${targetPeriodType}, 실제: ${periodInfo.periodType}, -30)`)
  }

  // 5. 보고서 기준 종료일과 endDate 일치 체크
  if (reportEndDate && periodInfo.endDate) {
    const reportEnd = new Date(reportEndDate)
    const periodEnd = new Date(periodInfo.endDate)
    
    // 같은 날짜인지 확인 (시간 부분 무시)
    if (reportEnd.getFullYear() === periodEnd.getFullYear() &&
        reportEnd.getMonth() === periodEnd.getMonth() &&
        reportEnd.getDate() === periodEnd.getDate()) {
      score += 20
      reasons.push(`보고서 기준 종료일 일치 (${reportEndDate}, +20)`)
    }
  }

  // 6. 최신 날짜 보너스 (같은 조건에서 최신 것 우선)
  // 이건 나중에 비교 단계에서 처리

  return {
    contextRef,
    score,
    periodInfo,
    reason: reasons,
  }
}

/**
 * ContextRef 배열에서 최신 CFY 기간 선택 (점수 기반)
 */
export function selectBestContextRef(
  contextRefs: string[],
  xmlDoc: Document,
  fieldType: 'income' | 'cashflow' | 'balance' = 'income',
  preferredPeriodType?: 'Q' | 'YTD' | 'FY',
  reportEndDate?: string
): string | null {
  if (contextRefs.length === 0) {
    return null
  }

  // 각 contextRef에 대해 점수 계산
  const scoredContexts: ContextScore[] = []
  
  for (const contextRef of contextRefs) {
    const scored = scoreContextRef(contextRef, xmlDoc, fieldType, preferredPeriodType, reportEndDate)
    if (scored) {
      scoredContexts.push(scored)
    }
  }

  if (scoredContexts.length === 0) {
    return null
  }

  // 세그먼트/축 포함 컨텍스트는 기본 제외
  // 또한 DiscontinuedOperationsMember, NoncontrollingInterestsMember 포함 컨텍스트도 제외
  const validContexts = scoredContexts.filter(scored => {
    if (scored.periodInfo.hasSegmentOrAxis) return false
    // DiscontinuedOperationsMember, NoncontrollingInterestsMember 포함 컨텍스트 제외
    const contextRefLower = scored.contextRef.toLowerCase()
    if (contextRefLower.includes('discontinuedoperations') || contextRefLower.includes('noncontrollinginterests')) {
      return false
    }
    return true
  })
  
  if (validContexts.length === 0) {
    // 세그먼트/축/비정상 멤버만 있는 경우 경고 후 null 반환 (fallback으로 잘못된 컨텍스트 선택 방지)
    console.error(`[XBRL Period Selector] 모든 컨텍스트가 세그먼트/축/DiscontinuedOperationsMember/NoncontrollingInterestsMember를 포함합니다.`)
    console.error(`[XBRL Period Selector] 잘못된 컨텍스트 선택을 방지하기 위해 null을 반환합니다.`)
    console.error(`[XBRL Period Selector] 후보 컨텍스트 리스트:`, scoredContexts.map(s => `${s.contextRef} (점수: ${s.score})`).join(', '))
    return null
  }

  // 점수로 정렬 (높은 점수 우선)
  validContexts.sort((a, b) => {
    // 점수가 같으면 최신 날짜 우선
    if (Math.abs(a.score - b.score) < 5) {
      const dateA = a.periodInfo.endDate || a.periodInfo.instant || ''
      const dateB = b.periodInfo.endDate || b.periodInfo.instant || ''
      return dateB.localeCompare(dateA)
    }
    return b.score - a.score
  })

  const best = validContexts[0]
  
  dlog(`[XBRL Period Selector] 최적 컨텍스트 선택: contextRef=${best.contextRef}, 점수=${best.score}, 기간=${best.periodInfo.periodTypeLabel || best.periodInfo.periodType || 'N/A'}`)
  dlog(`[XBRL Period Selector] 점수 사유: ${best.reason.join('; ')}`)
  dlog(`[XBRL Period Selector] 연결 여부: ${best.periodInfo.isConsolidated ? '연결' : best.periodInfo.isSeparate ? '별도' : '불명확'}, dimension 개수: ${best.periodInfo.dimensionCount || 0}`)
  
  // 세그먼트/축이 선택되지 않았음을 확인 (검증)
  if (best.periodInfo.hasSegmentOrAxis) {
    console.error(`[XBRL Period Selector] ERROR: 선택된 컨텍스트에 세그먼트/축이 포함되어 있습니다! 이는 선택 오류일 가능성이 높습니다.`)
  } else {
    dlog(`[XBRL Period Selector] ✓ 세그먼트/축이 포함되지 않은 정상 컨텍스트가 선택되었습니다.`)
  }
  
  return best.contextRef
}

/**
 * 특정 instant 날짜와 일치하는 contextRef 찾기 (차원/세그먼트 시그니처 우선)
 * @param targetDate ISO 8601 날짜 문자열 (YYYY-MM-DD)
 * @param xmlDoc XML 문서
 * @param preferSignatureContextRef 우선할 contextRef (차원/세그먼트 시그니처가 동일한 것을 우선)
 * @returns 최적의 contextRef 또는 null
 */
export function findBestInstantContextRef(
  targetDate: string,
  xmlDoc: Document,
  preferSignatureContextRef?: string
): string | null {
  // 모든 context 찾기
  const allContexts = xmlDoc.getElementsByTagNameNS('*', 'context')
  const candidates: Array<{ contextRef: string; periodInfo: PeriodInfo; signature: string }> = []
  
  // preferSignatureContextRef의 시그니처 추출
  let preferSignature: string | undefined
  if (preferSignatureContextRef) {
    const preferPeriodInfo = extractPeriodInfo(xmlDoc, preferSignatureContextRef)
    if (preferPeriodInfo) {
      // context 요소에서 explicitMember/typedMember 추출하여 시그니처 생성
      let contextElement: Element | null = null
      try {
        for (let i = 0; i < allContexts.length; i++) {
          const ctx = allContexts[i]
          if (ctx.getAttribute('id') === preferSignatureContextRef) {
            contextElement = ctx
            break
          }
        }
      } catch (error) {
        // 무시
      }
      
      if (contextElement) {
        const explicitMembers = Array.from(contextElement.getElementsByTagNameNS('*', 'explicitMember'))
        const typedMembers = Array.from(contextElement.getElementsByTagNameNS('*', 'typedMember'))
        const memberSignatures = [
          ...explicitMembers.map(m => `${m.getAttribute('dimension') || ''}:${m.textContent || ''}`),
          ...typedMembers.map(m => `${m.getAttribute('dimension') || ''}:${m.textContent || ''}`)
        ].sort()
        preferSignature = memberSignatures.join('|')
      }
    }
  }
  
  // targetDate와 일치하는 instant를 가진 context 찾기
  for (let i = 0; i < allContexts.length; i++) {
    const ctx = allContexts[i]
    const contextRef = ctx.getAttribute('id')
    if (!contextRef) continue
    
    const periodInfo = extractPeriodInfo(xmlDoc, contextRef)
    if (!periodInfo || !periodInfo.instant) continue
    
    // instant가 targetDate와 정확히 일치하는지 확인
    if (periodInfo.instant === targetDate) {
      // 시그니처 추출
      const explicitMembers = Array.from(ctx.getElementsByTagNameNS('*', 'explicitMember'))
      const typedMembers = Array.from(ctx.getElementsByTagNameNS('*', 'typedMember'))
      const memberSignatures = [
        ...explicitMembers.map(m => `${m.getAttribute('dimension') || ''}:${m.textContent || ''}`),
        ...typedMembers.map(m => `${m.getAttribute('dimension') || ''}:${m.textContent || ''}`)
      ].sort()
      const signature = memberSignatures.join('|')
      
      candidates.push({ contextRef, periodInfo, signature })
    }
  }
  
  if (candidates.length === 0) {
    return null
  }
  
  // 시그니처가 일치하는 것을 우선 선택
  if (preferSignature) {
    const matchingSignature = candidates.find(c => c.signature === preferSignature)
    if (matchingSignature) {
      return matchingSignature.contextRef
    }
  }
  
  // 시그니처가 일치하는 것이 없으면 기존 우선순위(연결/단위)로 선택
  // scoreContextRef를 사용하여 점수 계산
  const scoredCandidates = candidates.map(c => {
    const scored = scoreContextRef(c.contextRef, xmlDoc, 'balance', 'FY')
    return scored ? { ...c, score: scored.score } : { ...c, score: -1000 }
  })
  
  // 점수로 정렬 (높은 점수 우선)
  scoredCandidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) < 5) {
      // 점수가 비슷하면 시그니처 길이가 짧은 것 우선 (dimension이 적은 것)
      return a.signature.length - b.signature.length
    }
    return b.score - a.score
  })
  
  return scoredCandidates[0].contextRef
}
