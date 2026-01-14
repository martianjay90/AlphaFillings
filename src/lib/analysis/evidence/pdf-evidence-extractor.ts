/**
 * PDF 근거 발췌 유틸리티
 * 문단 단위로 근거를 추출하고 페이지/섹션/헤딩 정보를 포함
 */

export type TopicLabel = 
  | '사업구조' 
  | '시장/수요' 
  | '경쟁' 
  | '가격/원가' 
  | '규제/리스크' 
  | '생산/공급망' 
  | '기타'

export interface PDFEvidence {
  id: string
  topic: TopicLabel
  title: string
  text: string // 문단 원문 전체, 가능한 한 비절단
  excerpt: string // 미리보기용 요약 1~2문장
  sourceInfo: {
    page?: number
    section?: string
    heading?: string
  }
}

export interface PDFEvidenceExtractorOptions {
  pageMap: Map<number, string> | Record<number, string>
  sectionMap?: Map<number, string> | Record<number, string>
  headingMap?: Map<number, string> | Record<number, string>
  companyName?: string
  businessPages?: number[]
}

/**
 * 토픽별 키워드 정의
 */
const TOPIC_KEYWORDS: Record<TopicLabel, string[]> = {
  '사업구조': [
    '사업', '부문', '제품', '솔루션', '고객', '매출', 'segment', 'DX', 'DS',
    '사업의 내용', '주요 제품', '제품 및 서비스', '영업의 개황', '부문 정보', '세그먼트', '매출 구성'
  ],
  '시장/수요': [
    '시장', '수요', '성장', '정체', '둔화', '전망', '교체', '투자',
    '시장의 특성', '시장 환경', '시장 전망', '수요 전망', '성장 전망'
  ],
  '경쟁': [
    '경쟁', '점유율', '중국', '업체', '추격', '가격 경쟁', '차별화',
    '경쟁현황', '경쟁 환경', '경쟁사', '시장 점유율', '경쟁력'
  ],
  '가격/원가': [
    '가격', '판가', 'ASP', '인상', '하락', '원가', '마진', '비용',
    '가격 정책', '가격 인상', '가격 하락', '원가 절감', '마진 개선'
  ],
  '규제/리스크': [
    '규제', '환경', '인증', '관세', '정책', '리스크', '환율',
    '규제 환경', '환경 규제', '인증 절차', '관세 정책', '리스크 관리'
  ],
  '생산/공급망': [
    '공장', '생산능력', '공급', '부품', '물류', '조달',
    '생산 현황', '생산 능력', '공급망', '부품 조달', '물류 체계'
  ],
  '기타': []
}

/**
 * 문단 분리 (\\n\\n 기준 우선, 없으면 라인 기반 휴리스틱)
 */
function splitIntoParagraphs(text: string): string[] {
  // \n\n 기준으로 분리
  const paragraphs = text.split(/\n\n+/)
  
  // 빈 문단 제거
  return paragraphs
    .map(p => p.trim())
    .filter(p => p.length > 0)
}

/**
 * PDF 추출 과정에서 발생하는 과도한 문단 분리를 완화
 * - 너무 짧은 조각(예: "습니다.")은 앞 문단에 병합
 * - 의미 없는 문단은 제거
 */
function normalizeParagraphs(paragraphs: string[]): string[] {
  const out: string[] = []

  const meaningfulLen = (s: string) => {
    // 한글/영문/숫자만 남겨 의미 문자 길이 추정
    const stripped = s
      .replace(/\s+/g, '')
      .replace(/[\.,()\-–—:;"'`~!@#$%^&*_+=<>?\/\\\[\]{}|]/g, '')
    return stripped.length
  }

  for (const raw of paragraphs) {
    const p = raw.replace(/\s+/g, ' ').trim()
    if (!p) continue

    const mlen = meaningfulLen(p)

    // 너무 짧은 조각은 앞 문단에 병합
    if (p.length < 40 || mlen < 20) {
      if (out.length > 0) {
        out[out.length - 1] = `${out[out.length - 1]} ${p}`.trim()
        continue
      }
      // 첫 문단이 짧으면 일단 유지
      out.push(p)
      continue
    }

    out.push(p)
  }

  // 병합 후에도 의미 없는 문단 제거
  return out.filter(p => meaningfulLen(p) >= 20)
}

/**
 * 짧은 문단 병합 (완결성 향상 → score<20 탈락 완화)
 * - MIN_LEN(140) 미만 문단을 인접 문단과 병합
 * - MAX_LEN(420) 초과 시 병합 중단
 * - 같은 페이지 내 인접 문단만 병합
 */
function mergeShortParagraphs(paragraphs: string[]): string[] {
  const MIN_LEN = 140
  const MAX_LEN = 420
  const merged: string[] = []
  
  let i = 0
  while (i < paragraphs.length) {
    let p = paragraphs[i].trim()
    
    // MIN_LEN 미만이면 다음 문단과 병합 시도
    while (p.length < MIN_LEN && i + 1 < paragraphs.length) {
      const next = paragraphs[i + 1].trim()
      
      // 다음 문단이 비어있으면 중단
      if (next.length === 0) break
      
      // 병합 후 길이가 MAX_LEN을 초과하면 중단
      const mergedText = `${p} ${next}`
      if (mergedText.length > MAX_LEN) break
      
      // 병합
      p = mergedText
      i++
    }
    
    merged.push(p)
    i++
  }
  
  return merged
}

/**
 * 문단에서 1~2문장 추출 (미리보기용)
 */
function extractPreviewSentences(text: string, maxLength: number = 150): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= maxLength) return flat

  const slice = flat.slice(0, maxLength)

  // 가능한 경우 문장 경계에서 자르기
  const candidates = [
    slice.lastIndexOf('.'),
    slice.lastIndexOf('다.'),
    slice.lastIndexOf('니다.'),
    slice.lastIndexOf('합니다.'),
    slice.lastIndexOf('임.'),
  ]
  const cutAt = Math.max(...candidates)

  const cut = cutAt > maxLength * 0.6 ? slice.slice(0, cutAt + 1) : slice
  return `${cut}...`
}

/**
 * 토픽 분류 (키워드 기반)
 */
function classifyTopic(text: string): TopicLabel {
  const lowerText = text.toLowerCase()
  const topicScores: Record<TopicLabel, number> = {
    '사업구조': 0,
    '시장/수요': 0,
    '경쟁': 0,
    '가격/원가': 0,
    '규제/리스크': 0,
    '생산/공급망': 0,
    '기타': 0,
  }
  
  // 각 토픽별 키워드 매칭 점수 계산
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (topic === '기타') continue
    
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        topicScores[topic as TopicLabel] += 1
      }
    }
  }
  
  // 최고 점수 토픽 선택
  let maxScore = 0
  let selectedTopic: TopicLabel = '기타'
  
  for (const [topic, score] of Object.entries(topicScores)) {
    if (score > maxScore) {
      maxScore = score
      selectedTopic = topic as TopicLabel
    }
  }
  
  return selectedTopic
}

/**
 * 문단 점수 계산 (키워드 매칭, 섹션 위치 등)
 */
function calculateParagraphScore(
  paragraph: string,
  topic: TopicLabel,
  pageNum: number,
  section?: string,
  heading?: string
): number {
  let score = 0
  
  // 토픽 키워드 매칭 개수
  const keywords = TOPIC_KEYWORDS[topic] || []
  const lowerText = paragraph.toLowerCase()
  const matchedKeywords = keywords.filter(kw => 
    lowerText.includes(kw.toLowerCase())
  ).length
  score += matchedKeywords * 2
  
  // 섹션이 사업 관련이면 가점
  if (section && /사업|제품|영업|부문|세그먼트/i.test(section)) {
    score += 3
  }
  
  // 헤딩이 있으면 가점
  if (heading) {
    score += 2
  }
  
  // 문단 길이 적정성 (너무 짧거나 길면 감점)
  const length = paragraph.length
  if (length < 50) {
    score -= 2
  } else if (length > 500) {
    score -= 1
  } else if (length >= 100 && length <= 300) {
    score += 1
  }
  
  // 한글 비율 확인
  const koreanRatio = (paragraph.match(/[가-힣]/g) || []).length / paragraph.length
  if (koreanRatio < 0.3) {
    score -= 2
  }
  
  return score
}

/**
 * PDF에서 근거 발췌 추출
 */
export function extractPDFEvidence(
  options: PDFEvidenceExtractorOptions
): PDFEvidence[] {
  const {
    pageMap,
    sectionMap,
    headingMap,
    businessPages,
  } = options
  
  // pageMap을 Record로 변환
  const pageMapRecord: Record<number, string> = pageMap instanceof Map
    ? Object.fromEntries(pageMap)
    : pageMap
  
  const sectionMapRecord: Record<number, string> | undefined = sectionMap instanceof Map
    ? Object.fromEntries(sectionMap)
    : sectionMap
  
  const headingMapRecord: Record<number, string> | undefined = headingMap instanceof Map
    ? Object.fromEntries(headingMap)
    : headingMap
  
  // 문단 후보 수집
  type ParagraphCandidate = {
    page: number
    paragraph: string
    topic: TopicLabel
    section?: string
    heading?: string
    score: number
  }
  
  const candidates: ParagraphCandidate[] = []
  
  /**
   * Step1 관련 섹션/헤딩 판정
   * section + heading 문자열에 Step1 관련 키워드가 포함되어 있으면 true
   */
  function isStep1RelevantSection(section?: string, heading?: string): boolean {
    if (!section && !heading) return false
    
    const combined = `${section || ''} ${heading || ''}`.toLowerCase()
    
    // Step1 관련 키워드
    const step1Keywords = [
      '시장', '수요', '경쟁', '점유율', '가격', '판가', '원가', '마진', '비용',
      '환율', '금리', '규제', '환경', '인증', '관세', '정책', '리스크', '위험',
      '소송', '제재', '공급', '생산', '조달', '원자재', '물류', '재고', '고객', '전망'
    ]
    
    return step1Keywords.some(keyword => combined.includes(keyword))
  }
  
  // 처리할 페이지 목록 구성
  // 1) businessPages (있으면 포함)
  const businessPagesSet = businessPages && businessPages.length > 0
    ? new Set(businessPages)
    : new Set<number>()
  
  // 2) Step1 관련 섹션/헤딩 페이지 추가
  const step1RelevantPages = new Set<number>()
  if (sectionMapRecord || headingMapRecord) {
    const allPageNums = Object.keys(pageMapRecord).map(k => parseInt(k, 10))
    for (const pageNum of allPageNums) {
      const section = sectionMapRecord?.[pageNum]
      const heading = headingMapRecord?.[pageNum]
      if (isStep1RelevantSection(section, heading)) {
        step1RelevantPages.add(pageNum)
      }
    }
  }
  
  // 3) Union: businessPages + step1RelevantPages
  const pagesToProcessSet = new Set<number>()
  businessPagesSet.forEach(p => pagesToProcessSet.add(p))
  step1RelevantPages.forEach(p => pagesToProcessSet.add(p))
  
  // 4) 결과가 비어있으면 전체 페이지 폴백
  const pagesToProcess = pagesToProcessSet.size > 0
    ? Array.from(pagesToProcessSet).sort((a, b) => a - b)
    : Object.keys(pageMapRecord).map(k => parseInt(k, 10)).sort((a, b) => a - b)
  
  for (const pageNum of pagesToProcess) {
    const pageText = pageMapRecord[pageNum]
    if (!pageText) continue
    
    // 섹션/헤딩 정보
    const section = sectionMapRecord?.[pageNum]
    const heading = headingMapRecord?.[pageNum]
    
    // 문단 분리 → 정규화 → 짧은 문단 병합
    const rawParagraphs = splitIntoParagraphs(pageText)
    const normalizedParagraphs = normalizeParagraphs(rawParagraphs)
    const paragraphs = mergeShortParagraphs(normalizedParagraphs)
    
    for (const paragraph of paragraphs) {
      // 토픽 분류
      const topic = classifyTopic(paragraph)
      
      // 점수 계산
      const score = calculateParagraphScore(paragraph, topic, pageNum, section, heading)
      
      if (score > 0) {
        candidates.push({
          page: pageNum,
          paragraph,
          topic,
          section,
          heading,
          score,
        })
      }
    }
  }
  
  // 토픽별로 정렬 후 상위 선택
  const topicGroups = new Map<TopicLabel, ParagraphCandidate[]>()
  for (const candidate of candidates) {
    if (!topicGroups.has(candidate.topic)) {
      topicGroups.set(candidate.topic, [])
    }
    topicGroups.get(candidate.topic)!.push(candidate)
  }
  
  // 각 토픽별로 점수 내림차순 정렬
  for (const [topic, group] of topicGroups.entries()) {
    group.sort((a, b) => b.score - a.score)
  }
  
  // 토픽별 max 8개, 전체 max 40개 선택
  const selected: ParagraphCandidate[] = []
  const maxPerTopic = 8
  const maxTotal = 40
  
  // 토픽 우선순위: 사업구조 > 시장/수요 > 경쟁 > 가격/원가 > 규제/리스크 > 생산/공급망 > 기타
  const topicPriority: TopicLabel[] = [
    '사업구조',
    '시장/수요',
    '경쟁',
    '가격/원가',
    '규제/리스크',
    '생산/공급망',
    '기타',
  ]
  
  // 토픽 다양성을 위해 라운드로빈으로 선택
  for (let round = 0; round < maxPerTopic; round++) {
    for (const topic of topicPriority) {
      if (selected.length >= maxTotal) break
      const group = topicGroups.get(topic) || []
      const candidate = group[round]
      if (candidate) selected.push(candidate)
    }
    if (selected.length >= maxTotal) break
  }
  
  // PDFEvidence 형식으로 변환
  const evidence: PDFEvidence[] = selected.map((candidate, index) => {
    const id = `pdf-evidence-${index + 1}`
    const title = `[${candidate.topic}]`
    const excerpt = extractPreviewSentences(candidate.paragraph)
    
    return {
      id,
      topic: candidate.topic,
      title,
      text: candidate.paragraph,
      excerpt,
      sourceInfo: {
        page: candidate.page,
        section: candidate.section,
        heading: candidate.heading,
      },
    }
  })
  
  return evidence
}
