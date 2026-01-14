/**
 * 산업 특성 근거 문단 선택 유틸리티
 * 결정론 점수화 기반으로 trait별 최적 근거 문단 선택
 */

import type { IndustryClassification } from '@/types/analysis-bundle'
import type { TopicLabel } from '@/lib/analysis/evidence/pdf-evidence-extractor'

export type TraitType = 'cyclical' | 'competition' | 'pricingPower' | 'regulation'

/**
 * Evidence 항목 타입 (IndustryClassification.evidence에서 사용)
 */
type EvidenceItem = NonNullable<IndustryClassification['evidence']>[0]

/**
 * Topic 정규화 (canonical topic으로 변환)
 */
export function normalizeTopic(topic: string | undefined): TopicLabel {
  if (!topic) return '기타'
  
  const normalized = topic.trim()
  
  // 토픽 매핑
  if (normalized.includes('사업') || normalized.includes('구조')) return '사업구조'
  if (normalized.includes('시장') || normalized.includes('수요')) return '시장/수요'
  if (normalized.includes('경쟁')) return '경쟁'
  if (normalized.includes('가격') || normalized.includes('원가')) return '가격/원가'
  if (normalized.includes('규제') || normalized.includes('리스크')) return '규제/리스크'
  if (normalized.includes('생산') || normalized.includes('공급')) return '생산/공급망'
  
  return '기타'
}

/**
 * Trait별 Topic 우선순위 배열
 */
export function getTopicPriority(trait: TraitType): TopicLabel[] {
  switch (trait) {
    case 'cyclical':
      return ['시장/수요', '사업구조']
    case 'competition':
      return ['경쟁', '시장/수요']
    case 'pricingPower':
      return ['가격/원가', '경쟁', '사업구조']
    case 'regulation':
      return ['규제/리스크']
    default:
      return ['기타']
  }
}

/**
 * 텍스트 정제 (헤더/푸터/URL/(p.xx)/중복 공백 제거)
 */
export function sanitizeText(text: string): string {
  if (!text) return ''
  
  let cleaned = text
  
  // URL 제거 (http/https)
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, '')
  
  // (p.xx...) 패턴 제거
  cleaned = cleaned.replace(/\(p\.\d+[^)]*\)/gi, '')
  
  // [주제] 접두 제거
  cleaned = cleaned.replace(/^\[[^\]]+\]\s*/, '')
  
  // 연속 공백/개행을 단일 공백으로
  cleaned = cleaned.replace(/\s+/g, ' ')
  
  return cleaned.trim()
}

/**
 * 표/도표성 감지
 */
export function isTableLike(text: string): boolean {
  if (!text || text.length < 20) return false
  
  const lines = text.split(/\n/)
  
  // 구분자(|, ─, …) 과다 (rawText 기준)
  const separatorCount = (text.match(/[|│─━…]/g) || []).length
  if (separatorCount > text.length * 0.1) return true
  
  // 숫자 비율 과다 (전체의 30% 이상이 숫자/기호, rawText 기준)
  const digitSymbolCount = (text.match(/[\d\.,%()\-]/g) || []).length
  if (digitSymbolCount > text.length * 0.3) return true
  
  // 열 정렬 패턴 (여러 라인이 비슷한 길이 + 공백으로 정렬)
  // lines.length >= 3일 때만 체크
  if (lines.length >= 3) {
    const lineLengths = lines.map(l => l.trim().length).filter(len => len > 0)
    if (lineLengths.length >= 3) {
      const avgLength = lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length
      const variance = lineLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lineLengths.length
      // 분산이 작으면 정렬된 것으로 간주
      if (variance < avgLength * 0.1 && avgLength > 20) return true
    }
  }
  
  return false
}

/**
 * 잘린 헤더/단문 조각 감지
 * @param rawText 원문 텍스트 (sanitizeText 적용 전)
 * @returns true면 junk (제외 대상)
 */
function isJunkFragment(rawText: string): boolean {
  if (!rawText || rawText.length === 0) return true
  
  // sanitizeText 적용
  const sanitized = sanitizeText(rawText)
  const length = sanitized.length
  
  // 1. length < 80이면 junk
  if (length < 80) return true
  
  // 2. 문장 종결이 전혀 없고 length < 160이면 junk
  const sentenceEndings = /[다니다습니다함임][\.\?\!]|\.|\?|!/
  if (!sentenceEndings.test(sanitized) && length < 160) {
    return true
  }
  
  // 3. URL/도메인/페이지/목차/표/그림 등 헤더성 패턴 포함 시 junk
  const headerPattern = /(http|www\.|darts?\.fss\.or\.kr|목차|페이지|page|표\s*\d|그림\s*\d)/i
  if (headerPattern.test(sanitized)) {
    return true
  }
  
  // 4. 공백 제거 후 한글이 20자 미만이면 junk
  const koreanOnly = sanitized.replace(/[^가-힣]/g, '')
  if (koreanOnly.length < 20) {
    return true
  }
  
  return false
}

/**
 * 회계/공시 문단 판정 (Negative Filter)
 * pricingPower/regulation 등에서 회계기준서/금융상품 공시 같은 문단을 배제
 * @param rawText 원문 텍스트
 * @returns true면 회계/공시 문단 (제외 대상)
 */
function isObviouslyAccountingOrDisclosure(rawText: string): boolean {
  if (!rawText) return false
  
  const t = sanitizeText(rawText).toLowerCase()
  
  // 회계/공시 관련 키워드 (최소 세트)
  const accountingKeywords = [
    '기업회계기준서', 'ifrs', '재무제표', '주석', '공시', '금융상품',
    '제1107호', '제1109호', '회계정책', '회계기준', '공정가치',
    '손상', '리스부채', '파생상품', '측정', '인식'
  ]
  
  return accountingKeywords.some(keyword => t.includes(keyword.toLowerCase()))
}

/**
 * 한국어 문장 분리 함수 (단순 결정론)
 * 마침표/물음표/느낌표 기준 split + "다/니다/습니다/함/임" 뒤 공백 처리
 */
function splitKoSentences(text: string): string[] {
  if (!text) return []
  
  // 마침표, 물음표, 느낌표로 분리
  const parts = text.split(/[.!?]\s*/)
  const sentences: string[] = []
  
  for (const part of parts) {
    if (!part.trim()) continue
    
    // "다/니다/습니다/함/임" 뒤 공백으로 추가 분리
    const koEndings = /(다|니다|습니다|함|임)\s+/g
    const subParts = part.split(koEndings)
    
    let current = ''
    for (let i = 0; i < subParts.length; i++) {
      current += subParts[i]
      
      // 다음 부분이 "다/니다/습니다/함/임"이고 그 뒤에 공백이 있으면 문장 끝
      if (i + 1 < subParts.length && /^(다|니다|습니다|함|임)$/.test(subParts[i + 1])) {
        current += subParts[i + 1]
        if (current.trim()) {
          sentences.push(current.trim())
        }
        current = ''
        i++ // subParts[i+1]도 처리했으므로
      }
    }
    
    // 남은 부분이 있으면 추가
    if (current.trim()) {
      sentences.push(current.trim())
    }
  }
  
  // 빈 문장 제거 및 정리
  return sentences.filter(s => s.length > 0)
}

/**
 * Trait별 근거 적합성 판정
 * 해당 Finding을 실제로 지지하는 근거인지 확인
 * @param trait Trait 타입
 * @param rawText 원문 텍스트
 * @param sourceInfo 소스 정보 (선택)
 * @returns true면 적합, false면 부적합 (채택 금지)
 */
function isRelevantForTrait(
  trait: TraitType,
  rawText: string,
  sourceInfo?: { section?: string; heading?: string }
): boolean {
  if (!rawText) return false
  
  // sanitizeText 적용 후 소문자 변환
  const t = sanitizeText(rawText).toLowerCase()
  
  // Helper: 리스트 중 하나라도 포함되는지 확인
  const hasAny = (list: string[]): boolean => {
    return list.some(x => t.includes(x.toLowerCase()))
  }
  
  // Trait별 필수 신호 정의 (단어 + 구(phrase) 2단)
  let requiredWords: string[] = []
  let requiredPhrases: string[] = []
  
  switch (trait) {
    case 'cyclical':
      // 경기민감도 필수 신호 (단어)
      requiredWords = [
        // 기존 신호 유지
        '경기', '거시', '매크로', '금리', '소비', '수요', '주택', '판매', '출하',
        '재고', '구매', '가처분', '침체', '회복', '수주', '발주', '주문',
        '가동률', '프로모션', '할인',
        // 확장 신호 추가
        '업황', '경영환경', '소비심리', '구매력', '경기변동', '경기둔화', '경기회복',
        '수요둔화', '수요부진', '수요회복', '수요감소', '수요증가', '교체수요',
        '내구재', '전방산업', '주택경기', '실물경제'
      ]
      // 경기민감도 필수 신호 (구/phrase)
      requiredPhrases = [
        '시장 환경', '경영 환경', '거시 환경', '금리 변동', '환율 변동',
        '소비 둔화', '수요 둔화', '수요 부진', '수요 회복', '구매력 약화', '주택 경기'
      ]
      // '시장' 단독 매칭은 금지 (구(phrase)로만 허용)
      // hasAny(requiredPhrases)가 true면 '시장 환경' 같은 구가 포함된 것이므로 허용
      break
      
    case 'competition':
      // 경쟁강도 필수 신호
      requiredWords = [
        '경쟁', '경쟁사', '업체', '점유율', '시장점유율', 'm/s', 'ms', '경쟁구도',
        '가격경쟁', '진입', '대체', '라인업'
      ]
      requiredPhrases = []
      break
      
    case 'pricingPower':
      // 가격결정력 필수 신호 (강한 앵커만 허용)
      // 핵심 신호(강한 앵커) 최소 1개는 반드시 포함해야 함
      requiredWords = [
        '가격', '판가', 'asp', '단가', '요금', '수수료', '가격인상', '인상',
        '가격인하', '인하', '할인', '프로모션'
      ]
      // '마진','원가','전가'는 보조 신호로만 사용 (단독으로는 통과 금지)
      requiredPhrases = []
      break
      
    case 'regulation':
      // 규제강도 필수 신호: Core/Aux 앵커 분리
      // regulationCoreAnchors: 핵심 규제 앵커 (필수)
      const regulationCoreAnchors = [
        '규제', '법규', '규정', '인허가', '허가', '제재', '리콜', '소송',
        '공정거래', '개인정보', '보안', '컴플라이언스', '준수', '인증'
      ]
      
      // regulationAuxAnchors: 보조 앵커 (관세만, 단독으로는 통과 불가)
      const regulationAuxAnchors = [
        '관세'
      ]
      
      // selfSufficientRegAnchors: 사건/리스크형 강한 앵커 (이것만 있어도 통과)
      // '준수'는 제거: 준수 소개만으로는 규제 강도 신호가 부족함
      // '관세'는 포함 금지: 관세는 보조 신호로만 취급
      const selfSufficientRegAnchors = [
        '제재', '리콜', '소송', '과징금', '벌금', '공정거래', '개인정보', '보안',
        '인허가', '허가', '컴플라이언스'
      ]
      
      // regulationContextTerms: "강한 규제 강도 신호"만 유지
      // 범용 단어 제거: 리스크, 영향, 투명성, 관리, 평가, 처리, 윤리, 방침, 체계, 프로세스, 거버넌스, 가능, 문제, 대응 등
      // AI 준수/인증 소개 같은 범용 컴플라이언스 문단이 regulation으로 채택되는 경로 차단
      const regulationContextTerms = [
        // 규제 강도/변경 신호
        '강화', '완화', '변경', '개정', '도입', '시행',
        // 위반/조사 신호
        '위반', '조사', '점검',
        // 비용/제재 신호
        '비용', '부과', '과징금', '벌금', '제재',
        // 사건 신호
        '리콜', '소송',
        // 인허가 신호
        '인허가', '허가',
        // 관세 신호
        '관세율', '관세'
      ]
      
      // Helper: Core anchor 확인
      const hasCoreAnchor = hasAny(regulationCoreAnchors)
      
      // Helper: Aux anchor 확인
      const hasAuxAnchor = hasAny(regulationAuxAnchors)
      
      // A. 문장 단위에서 regulationCoreAnchors 1개 이상 매치가 없으면 false
      // 즉, 관세 단독 문단은 무조건 false
      if (!hasCoreAnchor) {
        return false
      }
      
      // B. selfSufficientRegAnchors(사건/리스크형 강한 앵커) 포함 시 true
      // 예: 제재, 리콜, 소송, 과징금, 벌금 등은 강도 신호가 명확하므로 단독으로도 통과
      const hasSelfSufficient = hasAny(selfSufficientRegAnchors)
      if (hasSelfSufficient) {
        return true
      }
      
      // C. core anchor가 있는 문장에 한해, "강한 컨텍스트(비용/제재/부과/조사/강화/개정/관세율 등)" 조건을 적용
      // '문장 단위로' (core anchor >=1) AND (regulationContextTerms >=1) 동시에 만족하는 문장이 1개라도 있을 때만 true
      // 즉, 준수/인증/규제 대응 같은 단어만 있고 강도 신호(강화/변경/비용/제재 등)가 없으면 false로 떨어져 best=null(보류) 가능
      const sentences = splitKoSentences(rawText)
      for (const sentence of sentences) {
        const s = sanitizeText(sentence).toLowerCase()
        const hasCoreAnchorInSentence = regulationCoreAnchors.some(anchor => 
          s.includes(anchor.toLowerCase())
        )
        const hasContextInSentence = regulationContextTerms.some(context => 
          s.includes(context.toLowerCase())
        )
        
        // 같은 문장 안에서 core anchor와 context term이 동시에 존재하면 통과
        if (hasCoreAnchorInSentence && hasContextInSentence) {
          return true
        }
      }
      
      // core anchor는 있지만 selfSufficient도 없고 같은 문장에 context도 없으면 탈락
      // 예: "준수하고 있습니다", "인증을 받았습니다" 같은 소개만으로는 통과하지 못함
      // 예: "관세 정책 변동성" 같은 관세 단독 언급도 통과하지 못함
      return false
  }
  
  // pricingPower 특수 처리: 핵심 신호(강한 앵커) 필수
  if (trait === 'pricingPower') {
    // requiredWords는 이미 핵심 신호만 포함하도록 수정됨
    // '마진','원가','전가' 같은 보조 신호만으로는 통과 금지
    const hasWordMatch = hasAny(requiredWords)
    const hasPhraseMatch = hasAny(requiredPhrases)
    return hasWordMatch || hasPhraseMatch
  }
  
  // requiredWords 또는 requiredPhrases 중 하나라도 매칭되면 true
  const hasWordMatch = hasAny(requiredWords)
  const hasPhraseMatch = hasAny(requiredPhrases)
  
  // cyclical 특수 처리: '시장' 단독 매칭은 금지
  if (trait === 'cyclical') {
    // '시장' 단독이 포함되어 있고 구(phrase) 매칭이 없으면 false
    const hasMarketAlone = t.includes('시장') && !hasPhraseMatch
    if (hasMarketAlone) {
      return false
    }
  }
  
  return hasWordMatch || hasPhraseMatch
}

/**
 * Trait별 섹션/헤딩 정합성 점수 계산
 * @param trait Trait 타입
 * @param section 섹션명 (예: "사업의 내용")
 * @param heading 헤딩명 (예: "주요 제품")
 * @returns 가점/감점 점수 (-10 ~ +12)
 */
export function scoreSectionAlignment(
  trait: TraitType,
  section?: string,
  heading?: string
): number {
  // text 생성: section과 heading 결합
  const text = `${section || ''} ${heading || ''}`.trim().toLowerCase()
  
  // text가 비어있으면 중립 (0점)
  if (!text) return 0
  
  // Trait별 키워드 매칭
  switch (trait) {
    case 'cyclical':
      // 가점 키워드
      const cyclicalPositive = ['시장', '수요', '경기', '거시', '산업', '판매', '주요제품', '전방']
      if (cyclicalPositive.some(kw => text.includes(kw))) {
        return +8
      }
      // 감점 키워드
      const cyclicalNegative = ['경쟁', '시장점유율', '경쟁구도']
      if (cyclicalNegative.some(kw => text.includes(kw))) {
        return -10
      }
      break
    
    case 'competition':
      // 가점 키워드
      const competitionPositive = ['경쟁', '시장점유율', '경쟁구도', '업계', '경쟁사']
      if (competitionPositive.some(kw => text.includes(kw))) {
        return +10
      }
      // 감점 키워드
      const competitionNegative = ['환경', '규제', '준법']
      if (competitionNegative.some(kw => text.includes(kw))) {
        return -6
      }
      break
    
    case 'pricingPower':
      // 가점 키워드
      const pricingPositive = ['가격', '판가', 'asp', '마진', '원가', '단가', '프리미엄']
      if (pricingPositive.some(kw => text.includes(kw))) {
        return +10
      }
      // 감점 키워드
      const pricingNegative = ['환경', '규제']
      if (pricingNegative.some(kw => text.includes(kw))) {
        return -6
      }
      break
    
    case 'regulation':
      // 가점 키워드
      const regulationPositive = ['환경', '규제', '준법', '인허가', '공정', '품질', '안전', 'esg']
      if (regulationPositive.some(kw => text.includes(kw))) {
        return +10
      }
      // 감점 키워드
      const regulationNegative = ['가격', 'asp', '판가']
      if (regulationNegative.some(kw => text.includes(kw))) {
        return -6
      }
      break
  }
  
  // 매칭 없으면 중립 (0점)
  return 0
}

/**
 * 섹션/헤딩 가중치 계산 (부스트)
 * 동일 trait에서 적합 후보가 여러 개일 때, 섹션/헤딩이 더 '그럴듯한' 근거를 우선 채택
 * @param trait Trait 타입
 * @param section 섹션명 (예: "사업의 내용")
 * @param heading 헤딩명 (예: "주요 제품")
 * @returns 부스트 점수 (음수/양수 가능)
 */
function getSectionHeadingBoost(
  trait: TraitType,
  section?: string,
  heading?: string
): number {
  // section과 heading 결합하여 단일 문자열 생성
  const combined = `${section || ''} ${heading || ''}`.trim().toLowerCase()
  
  if (!combined) return 0
  
  switch (trait) {
    case 'cyclical':
      // +10: 시장/수요/전망/업황/경영환경/위험/리스크 관련
      if (combined.includes('시장') || combined.includes('수요') || 
          combined.includes('전망') || combined.includes('업황') || 
          combined.includes('경영환경') || combined.includes('위험') || 
          combined.includes('리스크')) {
        return +10
      }
      // -8: 주요 제품/제품/R&D/연구/디자인/브랜드 관련
      if (combined.includes('주요 제품') || combined.includes('제품') || 
          combined.includes('r&d') || combined.includes('연구') || 
          combined.includes('디자인') || combined.includes('브랜드')) {
        return -8
      }
      break
      
    case 'regulation':
      // +12: 위험/리스크/환경/규제/인증/준법/컴플라이언스/법규 관련
      if (combined.includes('위험') || combined.includes('리스크') || 
          combined.includes('환경') || combined.includes('규제') || 
          combined.includes('인증') || combined.includes('준법') || 
          combined.includes('컴플라이언스') || combined.includes('법규')) {
        return +12
      }
      // -6: 주요 제품/제품 관련
      if (combined.includes('주요 제품') || combined.includes('제품')) {
        return -6
      }
      break
      
    case 'competition':
      // +8: 경쟁/시장/점유율/m/s/ms/경쟁구도 관련
      if (combined.includes('경쟁') || combined.includes('시장') || 
          combined.includes('점유율') || combined.includes('m/s') || 
          combined.includes('ms') || combined.includes('경쟁구도')) {
        return +8
      }
      break
      
    case 'pricingPower':
      // +8: 가격/판가/asp/단가/요금/수수료/마진/원가 관련
      if (combined.includes('가격') || combined.includes('판가') || 
          combined.includes('asp') || combined.includes('단가') || 
          combined.includes('요금') || combined.includes('수수료') || 
          combined.includes('마진') || combined.includes('원가')) {
        return +8
      }
      break
  }
  
  // 매칭 없으면 중립 (0점)
  return 0
}

/**
 * Evidence 점수 계산
 * 기본 10점 + 가점 - 감점
 */
export function scoreEvidence(
  trait: TraitType,
  ev: EvidenceItem
): number {
  let score = 10 // 기본 점수
  
  const topic = normalizeTopic(ev.topic)
  const topicPriority = getTopicPriority(trait)
  
  // Topic 우선순위 가점 (최대 +8)
  const topicIndex = topicPriority.indexOf(topic)
  if (topicIndex >= 0) {
    // 첫 번째 우선순위: +8, 두 번째: +5, 세 번째: +2
    const topicBonus = topicIndex === 0 ? 8 : topicIndex === 1 ? 5 : 2
    score += topicBonus
  } else {
    // 우선순위에 없으면 -2
    score -= 2
  }
  
  // Section/Heading 정합성 점수 (trait별 섹션 매칭)
  const section = ev.sourceInfo?.section
  const heading = ev.sourceInfo?.heading
  const sectionScore = scoreSectionAlignment(trait, section, heading)
  
  // 과감점 방지: 최대 가점 상한 적용 (+12)
  const cappedSectionScore = sectionScore > 12 ? 12 : sectionScore
  score += cappedSectionScore
  
  // SourceInfo 완성도 가점 (+2)
  // page 있고 (section 또는 heading) 있으면 가점
  if (ev.sourceInfo?.page && (ev.sourceInfo?.section || ev.sourceInfo?.heading)) {
    score += 2
  }
  
  // 텍스트 준비 (rawText와 sanitized 분리)
  const rawText = ev.text || ev.excerpt || ''
  const sanitized = sanitizeText(rawText)
  const length = sanitized.length
  
  // 길이 적정성 가점 (+2~+4)
  if (length >= 120 && length <= 360) {
    score += 4
  } else if (length >= 80 && length <= 500) {
    score += 2
  } else if (length < 40) {
    // 너무 짧으면 감점 (하지만 탈락은 pickBestParagraph에서 처리)
    score -= 2
  } else if (length > 800) {
    // 너무 길면 감점
    score -= 2
  }
  
  // TableLike 감점 (-8) - rawText 기준으로 판정
  if (isTableLike(rawText)) {
    score -= 8
  }
  
  // 노이즈 감점 (-2~-6) - sanitized 기준
  // URL이 남아있으면
  if (sanitized.match(/https?:\/\//i)) {
    score -= 6
  }
  
  // 반복되는 메타 텍스트 (예: "Page 33", "kr Page")
  if (sanitized.match(/(?:page|kr|en)\s*\d+/i)) {
    score -= 4
  }
  
  // 한글 비율이 너무 낮으면 감점 - sanitized 기준
  const koreanChars = (sanitized.match(/[가-힣]/g) || []).length
  const koreanRatio = sanitized.length > 0 ? koreanChars / sanitized.length : 0
  if (koreanRatio < 0.25 && sanitized.length > 50) {
    score -= 2
  }
  
  return score
}

/**
 * Trait별 최고점 문단 선택
 */
export function pickBestParagraph(
  trait: TraitType,
  evidences: EvidenceItem[],
  enableAudit: boolean = false
): {
  best: EvidenceItem | null
  score: number
  reasonCode?: string
  devAudit?: {
    inputTotal: number
    filteredJunk: number
    filteredAccounting?: number
    filteredIrrelevant: number
    filteredLowScore: number
    candidatesBeforeLowScore: number
    candidatesFinal: number
    relevanceDebug?: {
      poolMatchedAnchors: string[]
      bestMatchedAnchors: string[]
      poolAnchorHitCount: number
      bestAnchorHitCount: number
    }
    bestSummary?: {
      page?: number
      section?: string
      heading?: string
      finalScore: number
      textPreview: string
    }
  }
} {
  if (!evidences || evidences.length === 0) {
    return {
      best: null,
      score: 0,
      reasonCode: 'EVIDENCE_INSUFFICIENT',
    }
  }
  
  const topicPriority = getTopicPriority(trait)
  
  // Audit 카운터 (플래그 ON일 때만 수집)
  let filteredJunk = 0
  let filteredAccounting = 0
  let filteredIrrelevant = 0
  let filteredLowScore = 0
  const regulationMatchedAnchorsSet = new Set<string>() // regulation 전용: 후보 풀에서 매치된 앵커 수집 (중복 제거)
  const regulationCoreAnchorsSet = new Set<string>() // regulation 전용: 후보 풀에서 매치된 core 앵커 수집
  const regulationAuxAnchorsSet = new Set<string>() // regulation 전용: 후보 풀에서 매치된 aux 앵커 수집
  
  // Primary 후보군 (우선순위 토픽에 매칭)
  const primaryCandidates: Array<{ ev: EvidenceItem; score: number }> = []
  
  // 전체 후보군 (점수화용)
  const allCandidates: Array<{ ev: EvidenceItem; score: number }> = []
  
  for (const ev of evidences) {
    const rawText = ev.text || ev.excerpt || ''
    
    // (1) Junk fragment 제외
    if (isJunkFragment(rawText)) {
      if (enableAudit) filteredJunk++
      continue  // 후보에서 제외
    }
    
    // (2) 회계/공시 문단 제외 (공통 Negative Filter)
    if (isObviouslyAccountingOrDisclosure(rawText)) {
      if (enableAudit) filteredAccounting++
      continue  // 후보에서 제외
    }
    
    // (3) Trait 적합성 게이트: 부적합이면 채택 금지
    const isRelevant = isRelevantForTrait(trait, rawText, ev.sourceInfo)
    
    // regulation 전용: 앵커 매칭 카운트 및 매치된 앵커 수집 (DEV 진단용)
    if (enableAudit && trait === 'regulation') {
      const t = sanitizeText(rawText).toLowerCase()
      const regulationCoreAnchors = [
        '규제', '법규', '규정', '인허가', '허가', '제재', '리콜', '소송',
        '공정거래', '개인정보', '보안', '컴플라이언스', '준수', '인증'
      ]
      const regulationAuxAnchors = [
        '관세'
      ]
      
      // 매치된 core anchor 수집 (후보 풀 전체에서 수집, 중복 제거)
      for (const anchor of regulationCoreAnchors) {
        if (t.includes(anchor.toLowerCase())) {
          regulationCoreAnchorsSet.add(anchor)
          regulationMatchedAnchorsSet.add(anchor)
        }
      }
      
      // 매치된 aux anchor 수집 (후보 풀 전체에서 수집, 중복 제거)
      for (const anchor of regulationAuxAnchors) {
        if (t.includes(anchor.toLowerCase())) {
          regulationAuxAnchorsSet.add(anchor)
          regulationMatchedAnchorsSet.add(anchor)
        }
      }
    }
    
    if (!isRelevant) {
      if (enableAudit) filteredIrrelevant++
      continue  // 후보에서 완전 제외
    }
    
    // (4) 그 다음 scoreEvidence 계산/후보군 적재
    const baseScore = scoreEvidence(trait, ev)
    
    // 섹션/헤딩 가중치(부스트) 적용
    const boost = getSectionHeadingBoost(trait, ev.sourceInfo?.section, ev.sourceInfo?.heading)
    const finalScore = baseScore + boost
    
    // 점수 < 20인 경우 카운트 (relevance 통과 후 점수 계산된 것만)
    if (enableAudit && finalScore < 20) {
      filteredLowScore++
    }
    
    const topic = normalizeTopic(ev.topic)
    
    allCandidates.push({ ev, score: finalScore })
    
    // Primary 후보군에 포함되는지 확인
    if (topicPriority.includes(topic)) {
      primaryCandidates.push({ ev, score: finalScore })
    }
  }
  
  // Helper: 텍스트 미리보기 생성 (80자, 간단한 정리)
  const createTextPreview = (text: string): string => {
    if (!text) return ''
    const cleaned = sanitizeText(text).replace(/\s+/g, ' ').trim()
    return cleaned.length > 80 ? cleaned.substring(0, 77) + '...' : cleaned
  }
  
  // Helper: regulation 전용 textPreview 생성 (앵커 주변 스니펫)
  const createRegulationTextPreview = (text: string, matchedAnchors: string[]): string => {
    if (!text || matchedAnchors.length === 0) {
      // 앵커 못 찾으면 기존 preview 폴백
      return createTextPreview(text)
    }
    
    const cleaned = sanitizeText(text).replace(/\s+/g, ' ').trim()
    const lowerText = cleaned.toLowerCase()
    
    // 첫 번째 앵커 위치 찾기
    const firstAnchor = matchedAnchors[0].toLowerCase()
    const anchorIndex = lowerText.indexOf(firstAnchor)
    
    if (anchorIndex === -1) {
      // 앵커 위치를 못 찾으면 기존 preview 폴백
      return createTextPreview(text)
    }
    
    // 앵커 주변 160~220자 스니펫 생성
    const start = Math.max(0, anchorIndex - 80)
    const end = Math.min(cleaned.length, anchorIndex + firstAnchor.length + 140)
    let snippet = cleaned.substring(start, end)
    
    // 앞부분이 잘렸으면 "..." 추가
    if (start > 0) {
      snippet = '...' + snippet
    }
    // 뒷부분이 잘렸으면 "..." 추가
    if (end < cleaned.length) {
      snippet = snippet + '...'
    }
    
    // 최종 길이 조정 (160~220자)
    if (snippet.length > 220) {
      snippet = snippet.substring(0, 217) + '...'
    }
    
    return snippet
  }
  
  // Helper: regulation core/aux anchor 목록 (createDevAudit에서도 사용)
  const getRegulationCoreAnchors = () => [
    '규제', '법규', '규정', '인허가', '허가', '제재', '리콜', '소송',
    '공정거래', '개인정보', '보안', '컴플라이언스', '준수', '인증'
  ]
  const getRegulationAuxAnchors = () => [
    '관세'
  ]
  const getRegulationAllAnchors = () => [
    ...getRegulationCoreAnchors(),
    ...getRegulationAuxAnchors()
  ]
  
  // Helper: 텍스트에서 매치된 anchor 찾기 (최대 3개, core/aux 구분 없이)
  const findMatchedAnchors = (text: string): string[] => {
    if (trait !== 'regulation') return []
    const t = sanitizeText(text).toLowerCase()
    const allAnchors = getRegulationAllAnchors()
    const matched: string[] = []
    for (const anchor of allAnchors) {
      if (t.includes(anchor.toLowerCase())) {
        matched.push(anchor)
        if (matched.length >= 3) break // 최대 3개까지만
      }
    }
    return matched
  }
  
  // Helper: devAudit 생성
  const createDevAudit = (best: EvidenceItem | null, finalScore: number) => {
    if (!enableAudit) return undefined
    
    // regulation 전용: bestMatchedAnchors 및 textPreview 생성
    const bestMatchedAnchors = best && trait === 'regulation'
      ? findMatchedAnchors(best.text || best.excerpt || '')
      : undefined
    
    // regulation일 때는 앵커 주변 스니펫으로 textPreview 생성
    const textPreview = best
      ? (trait === 'regulation' && bestMatchedAnchors && bestMatchedAnchors.length > 0
          ? createRegulationTextPreview(best.text || best.excerpt || '', bestMatchedAnchors)
          : createTextPreview(best.text || best.excerpt || ''))
      : ''
    
    const bestSummary = best ? {
      page: best.sourceInfo?.page,
      section: best.sourceInfo?.section,
      heading: best.sourceInfo?.heading,
      finalScore,
      textPreview,
      ...(bestMatchedAnchors && bestMatchedAnchors.length > 0 ? {
        matchedAnchors: bestMatchedAnchors
      } : {}),
    } : undefined
    
    // candidatesBeforeLowScore: junk + irrelevant 제외 후 남은 후보 수
    const candidatesBeforeLowScore = allCandidates.length
    
    // candidatesFinal: lowScore(score<20)까지 제외한 최종 후보 수
    const candidatesFinal = allCandidates.filter(c => c.score >= 20).length
    
    // regulation 전용: relevanceDebug 구조 통일
    // poolMatchedAnchors는 중복 제거된 배열로 만들고, 카운트는 이 배열 기준으로 계산
    let poolMatchedAnchors: string[] | undefined = undefined
    let poolCoreHitCount: number | undefined = undefined
    let poolAuxHitCount: number | undefined = undefined
    let poolAnchorHitCount: number | undefined = undefined
    
    if (trait === 'regulation') {
      // 중복 제거된 배열 생성 (최대 3개)
      poolMatchedAnchors = Array.from(regulationMatchedAnchorsSet).slice(0, 3)
      
      // poolMatchedAnchors 기준으로 core/aux 카운트 계산
      const regulationCoreAnchors = [
        '규제', '법규', '규정', '인허가', '허가', '제재', '리콜', '소송',
        '공정거래', '개인정보', '보안', '컴플라이언스', '준수', '인증'
      ]
      const regulationAuxAnchors = ['관세']
      
      poolCoreHitCount = poolMatchedAnchors.filter(anchor => 
        regulationCoreAnchors.includes(anchor)
      ).length
      poolAuxHitCount = poolMatchedAnchors.filter(anchor => 
        regulationAuxAnchors.includes(anchor)
      ).length
      poolAnchorHitCount = poolMatchedAnchors.length
    }
    
    // regulation 전용: bestMatchedAnchors에서 core/aux 구분하여 카운트
    let bestCoreHitCount: number | undefined = undefined
    let bestAuxHitCount: number | undefined = undefined
    let bestAnchorHitCount: number | undefined = undefined
    
    if (trait === 'regulation' && bestMatchedAnchors) {
      const regulationCoreAnchors = [
        '규제', '법규', '규정', '인허가', '허가', '제재', '리콜', '소송',
        '공정거래', '개인정보', '보안', '컴플라이언스', '준수', '인증'
      ]
      const regulationAuxAnchors = ['관세']
      
      // bestMatchedAnchors는 이미 중복 제거된 배열이므로 그대로 사용
      bestCoreHitCount = bestMatchedAnchors.filter(anchor => 
        regulationCoreAnchors.includes(anchor)
      ).length
      bestAuxHitCount = bestMatchedAnchors.filter(anchor => 
        regulationAuxAnchors.includes(anchor)
      ).length
      bestAnchorHitCount = bestMatchedAnchors.length
    } else if (trait === 'regulation') {
      bestAnchorHitCount = 0
      bestCoreHitCount = 0
      bestAuxHitCount = 0
    }
    
    const audit = {
      inputTotal: evidences.length,
      filteredJunk,
      filteredAccounting: enableAudit ? filteredAccounting : undefined,
      filteredIrrelevant,
      filteredLowScore,
      candidatesBeforeLowScore,
      candidatesFinal,
      bestSummary,
      ...(enableAudit && trait === 'regulation' ? {
        relevanceDebug: {
          poolMatchedAnchors: poolMatchedAnchors || [],
          bestMatchedAnchors: bestMatchedAnchors || [],
          poolAnchorHitCount: poolAnchorHitCount ?? 0,
          bestAnchorHitCount: bestAnchorHitCount ?? 0,
          poolCoreHitCount: poolCoreHitCount ?? 0,
          poolAuxHitCount: poolAuxHitCount ?? 0,
          bestCoreHitCount: bestCoreHitCount ?? 0,
          bestAuxHitCount: bestAuxHitCount ?? 0,
        }
      } : {}),
    }
    
    return audit
  }
  
  // Primary 후보군이 있으면 그 중 최고점 선택
  if (primaryCandidates.length > 0) {
    primaryCandidates.sort((a, b) => b.score - a.score)
    const bestPrimary = primaryCandidates[0]
    
    if (bestPrimary.score >= 20) {
      return {
        best: bestPrimary.ev,
        score: bestPrimary.score,
        devAudit: createDevAudit(bestPrimary.ev, bestPrimary.score),
      }
    }
    
    // Primary 최고점이 20 미만인데 전체 후보군에서 20 이상이 있으면 TOPIC_MISMATCH
    allCandidates.sort((a, b) => b.score - a.score)
    const bestOverall = allCandidates[0]
    
    if (bestOverall.score >= 20) {
      return {
        best: bestOverall.ev,
        score: bestOverall.score,
        reasonCode: 'TOPIC_MISMATCH',
        devAudit: createDevAudit(bestOverall.ev, bestOverall.score),
      }
    }
    
    // Primary 최고점 < 20이고 전체도 < 20이면 LOW_QUALITY
    return {
      best: null,
      score: bestPrimary.score,
      reasonCode: 'EVIDENCE_LOW_QUALITY',
      devAudit: createDevAudit(null, bestPrimary.score),
    }
  }
  
  // Primary 후보군이 없으면 전체 후보군에서 선택
  allCandidates.sort((a, b) => b.score - a.score)
  
  if (allCandidates.length === 0) {
    const poolMatchedAnchors = trait === 'regulation'
      ? Array.from(regulationMatchedAnchorsSet).slice(0, 3)
      : undefined
    
    const insufficientAudit = enableAudit ? {
      inputTotal: evidences.length,
      filteredJunk,
      filteredAccounting,
      filteredIrrelevant,
      filteredLowScore,
      candidatesBeforeLowScore: 0,
      candidatesFinal: 0,
      ...(trait === 'regulation' ? {
        relevanceDebug: {
          poolMatchedAnchors: poolMatchedAnchors || [],
          bestMatchedAnchors: [],
          poolAnchorHitCount: poolMatchedAnchors ? poolMatchedAnchors.length : 0,
          bestAnchorHitCount: 0,
        }
      } : {}),
    } : undefined
    
    return {
      best: null,
      score: 0,
      reasonCode: 'EVIDENCE_INSUFFICIENT',
      devAudit: insufficientAudit,
    }
  }
  
  const bestOverall = allCandidates[0]
  
  if (bestOverall.score >= 20) {
    return {
      best: bestOverall.ev,
      score: bestOverall.score,
      reasonCode: 'TOPIC_MISMATCH',
      devAudit: createDevAudit(bestOverall.ev, bestOverall.score),
    }
  }
  
  // 점수가 20 미만이면 LOW_QUALITY
  return {
    best: null,
    score: bestOverall.score,
    reasonCode: 'EVIDENCE_LOW_QUALITY',
    devAudit: createDevAudit(null, bestOverall.score),
  }
}

/**
 * 문단에서 요지 1문장 추출 (결정론)
 */
export function summarizeDeterministic(text: string): string {
  if (!text) return ''
  
  const sanitized = sanitizeText(text)
  
  // 문장 분리 (한국어 종결 패턴 포함)
  const sentenceEnders = /[\.다니다합니다임요]\s+/
  const sentences = sanitized.split(sentenceEnders).filter(s => s.trim().length > 0)
  
  if (sentences.length === 0) {
    // 문장 종결 패턴이 없으면 전체 텍스트 반환 (220자 제한)
    return sanitized.length > 220 ? sanitized.substring(0, 217) + '...' : sanitized
  }
  
  // 첫 문장 선택
  let result = sentences[0].trim()
  
  // 첫 문장이 너무 짧으면(30자 미만) 다음 문장과 결합
  if (result.length < 30 && sentences.length > 1) {
    result = (result + ' ' + sentences[1].trim()).trim()
  }
  
  // 불필요 접두 제거 (예: "그리고", "또한", "또", "또한", "또한", "또한")
  result = result.replace(/^(그리고|또한|또|그러나|하지만|다만|그런데|그런|그래서|따라서|그러므로|따라서|그러나|하지만|다만|그런데|그런|그래서|따라서|그러므로)\s+/i, '')
  
  // 220자 제한
  if (result.length > 220) {
    // 가능한 경우 문장 경계에서 자르기
    const cutAt = result.lastIndexOf('.', 220)
    if (cutAt > 150) {
      result = result.substring(0, cutAt + 1)
    } else {
      result = result.substring(0, 217) + '...'
    }
  }
  
  return result
}
