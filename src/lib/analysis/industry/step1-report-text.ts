/**
 * Step1 리포트 텍스트 생성 유틸
 * C1/C2 결과를 검증하기 위한 유틸 함수
 */

import type { StepOutput, EvidenceRef, IndustryClassification } from '@/types/analysis-bundle'
import { summarizeDeterministic } from '@/lib/analysis/industry/industry-evidence-selector'
import { STEP1_TEXT } from '@/ui/labels/analysisSteps.ko'

/**
 * finding.id에서 trait 추출
 */
export function extractTraitFromFindingId(id: string): string | null {
  const match = id.match(/step01-finding-(cyclical|competition|pricingPower|regulation)/)
  return match ? match[1] : null
}

/**
 * trait 한글명 매핑
 */
export const TRAIT_LABELS: Record<string, string> = {
  cyclical: '경기민감도',
  competition: '경쟁강도',
  pricingPower: '가격결정력',
  regulation: '규제강도',
}

/**
 * Trait별 섹션 표시 여부 판정
 * trait와 명백히 어긋나는 섹션은 숨김(공란 처리)
 * @param trait Trait 타입 (null이면 항상 true)
 * @param section 섹션명
 * @param heading 헤딩명
 * @returns true면 표시, false면 숨김
 */
function shouldShowSection(
  trait: string | null,
  section?: string,
  heading?: string
): boolean {
  // trait 정보가 없으면 기본적으로 표시
  if (!trait) return true
  
  // section/heading이 없으면 표시 (공란 처리할 필요 없음)
  if (!section && !heading) return true
  
  // text 생성: section과 heading 결합
  const text = `${section || ''} ${heading || ''}`.trim().toLowerCase()
  
  if (!text) return true
  
  // Trait별 숨김 규칙
  switch (trait) {
    case 'cyclical':
      // '경쟁' 계열 섹션은 숨김
      if (text.includes('경쟁')) {
        return false
      }
      break
    
    case 'competition':
      // '환경/규제' 계열 섹션은 숨김
      if (text.includes('환경') || text.includes('규제') || text.includes('준법')) {
        return false
      }
      break
    
    case 'pricingPower':
      // '환경/규제' 계열 섹션은 숨김
      if (text.includes('환경') || text.includes('규제')) {
        return false
      }
      break
    
    case 'regulation':
      // '가격' 계열 섹션은 숨김
      if (text.includes('가격') || text.includes('asp') || text.includes('판가')) {
        return false
      }
      break
  }
  
  // 기본적으로 표시
  return true
}

/**
 * finding.text 파싱 (관찰/시사점 추출)
 */
export interface ParsedFinding {
  observation: string
  implication: string
}

export function parseFindingText(text: string): ParsedFinding {
  // 패턴 1: "관찰: ... 근거: ... 시사점: ..."
  const pattern1 = /관찰:\s*(.+?)\s+근거:\s*(.+?)\s+시사점:\s*(.+?)$/
  const match1 = text.match(pattern1)
  
  if (match1) {
    return {
      observation: match1[1].trim(),
      implication: match1[3].trim()
    }
  }
  
  // 패턴 2: "관찰: ... 시사점: ..." (근거 없음)
  const pattern2 = /관찰:\s*(.+?)\s+시사점:\s*(.+?)$/
  const match2 = text.match(pattern2)
  
  if (match2) {
    return {
      observation: match2[1].trim(),
      implication: match2[2].trim()
    }
  }
  
  // 패턴 3: "관찰: ..." (시사점 없음)
  const pattern3 = /관찰:\s*(.+?)$/
  const match3 = text.match(pattern3)
  
  if (match3) {
    return {
      observation: match3[1].trim(),
      implication: ''
    }
  }
  
  // 폴백: 파싱 실패 시 원문 전체를 관찰로, 시사점은 빈값
  return {
    observation: text,
    implication: ''
  }
}

/**
 * Evidence key 생성 (중복 판정용)
 * page, section, heading, quote를 사용하여 고유 키 생성
 */
export function generateEvidenceKey(ev: EvidenceRef): string {
  const page = ev.locator?.page || 0
  const section = ev.locator?.section || ''
  const heading = ev.locator?.heading || ''
  const quote = ev.quote || ''
  
  // quote 정규화: 공백 정리 + 200자 제한
  const quoteNormalized = quote
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200)
  
  return `${page}|${section}|${heading}|${quoteNormalized}`
}

/**
 * 본문 텍스트에서 인용문 제거 (방어 코드)
 * - 따옴표로 감싼 구간 제거 ("...", '...')
 * - evidence.quote가 포함되어 있으면 제거
 */
function removeQuotesFromMainText(text: string, evidenceQuotes: string[] = []): string {
  if (!text) return ''
  
  let cleaned = text
  
  // 1. 큰따옴표로 감싼 구간 제거
  cleaned = cleaned.replace(/"[^"]*"/g, '')
  
  // 2. 작은따옴표로 감싼 구간 제거
  cleaned = cleaned.replace(/'[^']*'/g, '')
  
  // 3. evidence.quote가 포함되어 있으면 제거 (부분 매칭)
  for (const quote of evidenceQuotes) {
    if (quote && quote.length > 20) {
      // 긴 quote의 경우 부분 매칭 (20자 이상)
      const quoteSubstring = quote.substring(0, 50) // 앞부분 50자만 체크
      if (cleaned.includes(quoteSubstring)) {
        // quote가 포함된 부분을 찾아서 제거
        const index = cleaned.indexOf(quoteSubstring)
        if (index !== -1) {
          // quote 시작 부분부터 끝까지 제거 (최대 200자)
          const endIndex = Math.min(index + quote.length, cleaned.length)
          cleaned = cleaned.substring(0, index) + cleaned.substring(endIndex)
        }
      }
    }
  }
  
  // 4. 연속 공백 정리
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  
  return cleaned
}

/**
 * 표시용 텍스트 정리
 * - 공백/개행 정리
 * - 깨진 띄어쓰기 제한적 복원 (가 격 → 가격, 것 으로 → 것으로)
 * - 일반 단어 사이 공백은 유지
 * - 길이 200자 제한 + 말줄임표
 */
function normalizeForDisplay(text: string): string {
  if (!text) return ''
  
  // 0. Zero-width 문자 제거 (최우선 처리)
  let normalized = text.replace(/[\u200B-\u200D\uFEFF]/g, '')
  
  // 1. 개행/탭 → 공백
  normalized = normalized.replace(/[\n\t\r]/g, ' ')
  
  // 2. 연속 공백 → 단일 공백
  normalized = normalized.replace(/\s+/g, ' ').trim()
  
  // 3. "및" 뒤 붙임 보정 강화 (및가격 → 및 가격, 공백 포함 케이스까지 통일)
  normalized = normalized.replace(/및\s*(?=[가-힣])/g, '및 ')
  
  // 4. "것 으로" 류 결합 보정 (제한된 패턴만 결합, 과교정 방지)
  // \b 제거: 한국어에는 워드 바운더리가 작동하지 않음
  normalized = normalized.replace(/(것|점|등|중|내|후|전)\s+(으로|로|에서|까지|부터|에게)/g, '$1$2')
  
  // 5. 깨진 띄어쓰기 제한적 복원
  // 토큰 분리 후, 한 글자 토큰이 연속으로 2개 이상 이어질 때만 붙이기
  // 단, 조사 토큰만 연속인 경우는 결합 제외 (과교정 방지)
  const tokens = normalized.split(' ')
  const result: string[] = []
  let i = 0
  
  // 조사 목록 (단독 연속인 경우 결합 제외)
  const 조사목록 = new Set(['이', '가', '은', '는', '을', '를', '에', '의', '과', '와', '도', '만', '로', '으로'])
  
  while (i < tokens.length) {
    const token = tokens[i]
    
    // 한 글자 토큰인지 확인 (한글 1글자)
    const isSingleChar = /^[가-힣]$/.test(token)
    
    if (isSingleChar) {
      // 연속된 한 글자 토큰들을 찾아서 붙이기
      let combined = token
      let j = i + 1
      const 연속토큰들: string[] = [token]
      
      while (j < tokens.length && /^[가-힣]$/.test(tokens[j])) {
        combined += tokens[j]
        연속토큰들.push(tokens[j])
        j++
      }
      
      // 연속 토큰들이 모두 조사인지 확인
      const 모두조사 = 연속토큰들.length >= 2 && 연속토큰들.every(t => 조사목록.has(t))
      
      // 2개 이상이고, 모두 조사가 아니면 붙인 결과 사용
      if (j - i >= 2 && !모두조사) {
        result.push(combined)
        i = j
      } else {
        // 1개거나 모두 조사면 그대로 유지 (결합하지 않음)
        result.push(token)
        i++
      }
    } else {
      // 일반 토큰은 그대로 유지 (공백 포함)
      result.push(token)
      i++
    }
  }
  
  normalized = result.join(' ')
  
  // 6. 후처리: "및" 분리 및 "것 으로" 결합 재적용 (토큰 결합 후 생성된 패턴 처리)
  normalized = normalized.replace(/및\s*(?=[가-힣])/g, '및 ')
  normalized = normalized.replace(/(것|점|등|중|내|후|전)\s+(으로|로|에서|까지|부터|에게)/g, '$1$2')
  
  // 7. 길이 제한 200자 + 말줄임표
  if (normalized.length > 200) {
    normalized = normalized.substring(0, 197) + '...'
  }
  
  return normalized
}

/**
 * Step1 리포트 텍스트 생성
 */
export function buildStep1ReportText(
  step: StepOutput,
  industry: IndustryClassification | undefined
): string {
  const lines: string[] = []
  
  // 1. Step 제목
  lines.push(`--- ${step.title} ---`)
  lines.push('')
  
  // 2. 산업 분류 블록
  if (industry) {
    lines.push('[산업 분류]')
    
    const core = industry.coreCategories?.[0]
    const adjacent = industry.adjacentCategories?.join('/')
    const confidence = Math.round((industry.confidence || 0) * 100)
    
    if (core) {
      lines.push(`핵심: ${core}`)
    } else {
      lines.push(`산업: ${industry.label}`)
    }
    
    if (adjacent) {
      lines.push(`부수: ${adjacent}`)
    }
    
    lines.push(`확신도: ${confidence}%`)
    
    if (industry.reasonCode) {
      lines.push(`[내부코드: ${industry.reasonCode}]`)
    }
    
    lines.push('')
  }
  
  // 3. Findings 블록 (trait별 순서 고정, 각주 구조)
  const traitOrder: Array<'cyclical' | 'competition' | 'pricingPower' | 'regulation'> = [
    'cyclical',
    'competition',
    'pricingPower',
    'regulation',
  ]
  
  // Evidence registry (각주 번호 부여)
  const evidenceMap = new Map<string, { ev: EvidenceRef; index: number }>()
  let evidenceCounter = 1
  
  lines.push('[핵심 관찰]')
  
  for (const trait of traitOrder) {
    const finding = step.findings.find(f => {
      const extractedTrait = extractTraitFromFindingId(f.id)
      return extractedTrait === trait
    })
    
    if (finding) {
      const traitLabel = TRAIT_LABELS[trait] || trait
      lines.push(`[${traitLabel}]`)
      
      // finding.text 파싱
      const parsed = parseFindingText(finding.text)
      
      // evidence의 quote 수집 (본문에서 제거용)
      const evidenceQuotes = finding.evidence
        ?.filter(ev => ev.quote && ev.quote.trim().length > 0)
        .map(ev => ev.quote!)
        || []
      
      // 본문 observation/implication에서 인용문 제거 후 정규화
      const cleanedObservation = removeQuotesFromMainText(parsed.observation, evidenceQuotes)
      const cleanedImplication = removeQuotesFromMainText(parsed.implication, evidenceQuotes)
      
      const normalizedObservation = normalizeForDisplay(cleanedObservation)
      const normalizedImplication = normalizeForDisplay(cleanedImplication)
      
      lines.push(`관찰: ${normalizedObservation}`)
      lines.push(`시사점: ${normalizedImplication}`)
      
      // 보류 여부 판정: reasonCode가 있으면 보류
      const isHold = Boolean(finding.reasonCode)
      
      // evidence 처리: 보류가 아니고 유효한 evidence가 있을 때만 [E#] 생성
      let evIndex: number | null = null
      if (!isHold) {
        const hasValidEvidence = finding.evidence && 
          finding.evidence.length > 0 && 
          finding.evidence[0].quote && 
          finding.evidence[0].quote.trim().length > 0
        
        if (hasValidEvidence) {
          const ev = finding.evidence[0]
          const evKey = generateEvidenceKey(ev)
          
          if (evidenceMap.has(evKey)) {
            evIndex = evidenceMap.get(evKey)!.index
          } else {
            evIndex = evidenceCounter++
            evidenceMap.set(evKey, { ev, index: evIndex })
          }
        }
      }
      
      // 근거 라인은 항상 출력
      if (evIndex !== null) {
        lines.push(`${STEP1_TEXT.findingEvidenceLabel}: [E${evIndex}]`)
      } else {
        lines.push(`${STEP1_TEXT.findingEvidenceLabel}: ${STEP1_TEXT.findingHoldEvidence}`)
      }
      
      lines.push('')
    }
  }
  
  // 4. Checkpoints 블록 (있으면)
  if (step.checkpoints && step.checkpoints.length > 0) {
    lines.push('[추가 확인]')
    
    for (const cp of step.checkpoints) {
      const parts: string[] = []
      if (cp.whatToWatch) parts.push(cp.whatToWatch)
      if (cp.nextQuarterAction) parts.push(cp.nextQuarterAction)
      if (cp.confirmQuestion) parts.push(`질문: ${cp.confirmQuestion}`)
      
      if (parts.length > 0) {
        lines.push(`- ${parts.join(' | ')}`)
      }
    }
    
    lines.push('')
  }
  
  // 5. 근거 목록 섹션
  if (evidenceMap.size > 0) {
    lines.push('[근거 목록]')
    
    const sortedEvidences = Array.from(evidenceMap.entries())
      .sort((a, b) => a[1].index - b[1].index)
    
    for (const [key, { ev, index }] of sortedEvidences) {
      const parts: string[] = []
      
      // page
      if (ev.locator?.page) {
        parts.push(`p.${ev.locator.page}`)
      }
      
      // trait 찾기 (finding 역참조)
      const traits = new Set<string>()
      for (const finding of step.findings) {
        if (finding.evidence?.some(e => generateEvidenceKey(e) === key)) {
          const trait = extractTraitFromFindingId(finding.id)
          if (trait) traits.add(trait)
        }
      }
      const primaryTrait = Array.from(traits)[0] || null
      
      // section/heading 표시 여부 판정
      const section = ev.locator?.section
      const heading = ev.locator?.heading
      const showSection = shouldShowSection(primaryTrait, section, heading)
      
      // section (trait와 불일치하지 않을 때만 표시)
      if (showSection && section) {
        parts.push(section)
      }
      
      // heading (section과 다를 때만 출력, showSection이 false면 둘 다 생략)
      if (showSection && heading && heading !== section) {
        parts.push(heading)
      }
      
      // quote (근거 목록에는 전체 quote 포함, normalizeForDisplay만 적용)
      const quote = ev.quote || ''
      if (quote) {
        const normalizedQuote = normalizeForDisplay(quote)
        parts.push(`"${normalizedQuote}"`)
      }
      
      lines.push(`[E${index}] ${parts.join(' | ')}`)
    }
    
    lines.push('')
  }
  
  return lines.join('\n')
}
