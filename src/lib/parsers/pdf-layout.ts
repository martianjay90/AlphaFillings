/**
 * PDF 레이아웃 처리 유틸리티
 * PDF.js TextItem을 라인/문단 구조로 복원하고 섹션/헤딩 맵 생성
 */

export interface TextItem {
  str: string
  transform: number[] // [a, b, c, d, e, f] where e=x, f=y
}

export interface LineGroup {
  y: number
  items: TextItem[]
  text: string
}

export interface PDFLayoutResult {
  /** 라인/문단 구조를 가진 텍스트 */
  text: string
  
  /** 페이지별 라인 그룹 */
  pageLines: Map<number, LineGroup[]>
  
  /** 페이지별 섹션 맵 (페이지 번호 -> 섹션명) */
  sectionMap: Map<number, string>
  
  /** 페이지별 헤딩 맵 (페이지 번호 -> 헤딩명) */
  headingMap: Map<number, string>
}

/**
 * y좌표 tolerance (같은 라인으로 묶을 최대 y 차이)
 */
const Y_TOLERANCE = 2.0

/**
 * 문단 분리 threshold (y-gap이 이 값보다 크면 문단 분리)
 */
const PARAGRAPH_GAP_THRESHOLD = 10.0

/**
 * 헤딩 후보 정규식
 */
const HEADING_PATTERNS = [
  /^사업의\s*내용/i,
  /^주요\s*제품/i,
  /^제품\s*및\s*서비스/i,
  /^영업의\s*개황/i,
  /^시장의\s*특성/i,
  /^경쟁/i,
  /^규제/i,
  /^리스크/i,
  /^세그먼트/i,
  /^부문\s*정보/i,
  /^매출\s*구성/i,
  /^사업\s*개요/i,
  /^경영\s*개요/i,
  /^주요\s*사업/i,
  /^사업\s*현황/i,
]

/**
 * TextItem들을 y좌표 기반으로 라인 그룹핑
 */
function groupTextItemsIntoLines(items: TextItem[]): LineGroup[] {
  // y좌표를 tolerance로 라운딩하여 그룹핑
  const lineMap = new Map<number, TextItem[]>()
  
  for (const item of items) {
    if (!item.transform || item.transform.length < 6) continue
    
    const y = item.transform[5] // transform[5] = y
    const roundedY = Math.round(y / Y_TOLERANCE) * Y_TOLERANCE
    
    if (!lineMap.has(roundedY)) {
      lineMap.set(roundedY, [])
    }
    lineMap.get(roundedY)!.push(item)
  }
  
  // 각 라인 내에서 x 오름차순 정렬
  const lines: LineGroup[] = []
  for (const [y, lineItems] of lineMap.entries()) {
    // x 좌표 기준 정렬 (transform[4] = x)
    lineItems.sort((a, b) => {
      const xA = a.transform?.[4] || 0
      const xB = b.transform?.[4] || 0
      return xA - xB
    })
    
    // 라인 텍스트 생성
    const text = lineItems.map(item => item.str).join('')
    
    lines.push({
      y,
      items: lineItems,
      text,
    })
  }
  
  // y 내림차순 정렬 (상->하, PDF 좌표계는 하단이 0이므로 큰 y가 위쪽)
  lines.sort((a, b) => b.y - a.y)
  
  return lines
}

/**
 * 라인 그룹들을 문단 구조로 변환
 */
function linesToParagraphText(lines: LineGroup[]): string {
  if (lines.length === 0) return ''
  
  const paragraphs: string[] = []
  let currentParagraph: string[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const nextLine = i + 1 < lines.length ? lines[i + 1] : null
    
    currentParagraph.push(line.text)
    
    // 다음 라인과의 y-gap 확인
    if (nextLine) {
      const yGap = line.y - nextLine.y // line.y > nextLine.y (내림차순 정렬)
      
      // y-gap이 threshold보다 크면 문단 분리
      if (yGap > PARAGRAPH_GAP_THRESHOLD) {
        paragraphs.push(currentParagraph.join(' '))
        currentParagraph = []
      }
    } else {
      // 마지막 라인
      paragraphs.push(currentParagraph.join(' '))
    }
  }
  
  // 문단 간 빈 줄로 구분
  return paragraphs.join('\n\n')
}

/**
 * 라인에서 헤딩 추출
 */
function extractHeadingFromLine(line: LineGroup): string | null {
  const text = line.text.trim()
  
  for (const pattern of HEADING_PATTERNS) {
    if (pattern.test(text)) {
      // 패턴 매칭된 부분 추출
      const match = text.match(pattern)
      if (match) {
        return match[0].trim()
      }
    }
  }
  
  return null
}

/**
 * PDF 페이지의 TextItem들을 레이아웃 구조로 변환
 */
export function processPDFPageLayout(
  pageNum: number,
  items: TextItem[]
): {
  text: string
  lines: LineGroup[]
  heading: string | null
} {
  // 라인 그룹핑
  const lines = groupTextItemsIntoLines(items)
  
  // 문단 구조로 변환
  const text = linesToParagraphText(lines)
  
  // 헤딩 추출 (첫 번째 매칭되는 라인)
  let heading: string | null = null
  for (const line of lines) {
    const extracted = extractHeadingFromLine(line)
    if (extracted) {
      heading = extracted
      break
    }
  }
  
  return {
    text,
    lines,
    heading,
  }
}

/**
 * 여러 페이지의 레이아웃 결과를 통합하여 sectionMap/headingMap 생성
 */
export function buildSectionAndHeadingMaps(
  pageResults: Map<number, { text: string; lines: LineGroup[]; heading: string | null }>
): {
  sectionMap: Map<number, string>
  headingMap: Map<number, string>
} {
  const sectionMap = new Map<number, string>()
  const headingMap = new Map<number, string>()
  
  let currentSection: string | null = null
  
  // 페이지 번호 순서대로 처리
  const sortedPages = Array.from(pageResults.keys()).sort((a, b) => a - b)
  
  for (const pageNum of sortedPages) {
    const result = pageResults.get(pageNum)!
    
    // 헤딩이 있으면 업데이트
    if (result.heading) {
      currentSection = result.heading
      headingMap.set(pageNum, result.heading)
    }
    
    // 현재 섹션을 페이지에 할당
    if (currentSection) {
      sectionMap.set(pageNum, currentSection)
    }
  }
  
  return { sectionMap, headingMap }
}
