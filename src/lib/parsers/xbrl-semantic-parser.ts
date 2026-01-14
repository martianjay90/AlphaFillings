/**
 * 지능형 XBRL 시맨틱 파서
 * 자동 합산, 유사도 기반 매핑 등 지능형 검색 로직
 */

/**
 * 자동 합산 로직
 * 결합형 항목을 찾을 수 없는 경우 개별 항목을 찾아 합산
 */
export interface AggregationResult {
  value: number
  unit: string
  components: Array<{ tag: string; value: number }>
  source: 'aggregated'
}

/**
 * 감가상각비(D&A) 자동 합산
 * Depreciation + Amortization을 각각 찾아 합산
 */
export function aggregateDepreciationAndAmortization(
  xmlDoc: Document,
  tagMapping: { depreciation: string[]; amortization: string[] }
): AggregationResult | null {
  const components: Array<{ tag: string; value: number }> = []
  let unit = 'KRW'
  let totalValue = 0

  // Depreciation 찾기
  const depreciationValue = findValueByLocalName(xmlDoc, tagMapping.depreciation, 'depreciation')
  if (depreciationValue) {
    components.push({ tag: 'Depreciation', value: depreciationValue.value })
    totalValue += depreciationValue.value
    unit = depreciationValue.unit
  }

  // Amortization 찾기
  const amortizationValue = findValueByLocalName(xmlDoc, tagMapping.amortization, 'amortization')
  if (amortizationValue) {
    components.push({ tag: 'Amortization', value: amortizationValue.value })
    totalValue += amortizationValue.value
    if (!unit) unit = amortizationValue.unit
  }

  if (components.length === 0) {
    return null
  }

  return {
    value: totalValue,
    unit,
    components,
    source: 'aggregated',
  }
}

/**
 * Local Name으로 값 찾기 (네임스페이스 무시)
 */
function findValueByLocalName(
  xmlDoc: Document,
  tags: string[],
  fieldName: string
): { value: number; unit: string } | null {
  // Local Name 추출
  const localNames = tags.map(tag => {
    const parts = tag.split(':')
    return parts.length > 1 ? parts[parts.length - 1] : tag
  }).filter((name, index, self) => self.indexOf(name) === index)

  for (const localName of localNames) {
    try {
      const allElements = Array.from(xmlDoc.querySelectorAll('*'))
      
      for (const element of allElements) {
        const elementLocalName = element.localName || element.tagName.split(':').pop() || element.tagName
        
        if (elementLocalName.toLowerCase() === localName.toLowerCase() ||
            elementLocalName.toLowerCase().includes(localName.toLowerCase()) ||
            localName.toLowerCase().includes(elementLocalName.toLowerCase())) {
          const textContent = element.textContent?.trim()
          if (!textContent) continue

          const cleanedText = textContent.replace(/,/g, '').replace(/\s/g, '')
          const numericValue = parseFloat(cleanedText)
          
          if (!isNaN(numericValue) && numericValue !== 0) {
            const unitRef = element.getAttribute('unitRef')
            const unit = extractUnit(xmlDoc, unitRef || '')
            
            return { value: numericValue, unit }
          }
        }
      }
    } catch (error) {
      continue
    }
  }

  return null
}

/**
 * 단위 추출
 */
function extractUnit(xmlDoc: Document, unitRef: string): string {
  if (!unitRef) return 'KRW'
  
  const unitElement = xmlDoc.querySelector(`unit[id="${unitRef}"]`)
  if (unitElement) {
    const measure = unitElement.querySelector('measure')
    if (measure) {
      const measureText = measure.textContent || ''
      if (measureText.includes('USD')) return 'USD'
      if (measureText.includes('KRW')) return 'KRW'
    }
  }
  
  return 'KRW'
}

/**
 * 유사도 기반 매핑
 * Label 필드를 분석하여 유사한 맥락의 태그 찾기
 */
export interface SimilarityMatch {
  element: Element
  similarity: number
  label: string
  tag: string
}

/**
 * Label 기반 유사도 검색
 */
export function findSimilarByLabel(
  xmlDoc: Document,
  targetLabels: string[],
  fieldName: string
): SimilarityMatch | null {
  try {
    // 모든 요소에서 label 속성 또는 label 요소 찾기
    const allElements = Array.from(xmlDoc.querySelectorAll('*'))
    const matches: SimilarityMatch[] = []

    for (const element of allElements) {
      // label 속성 확인
      const labelAttr = element.getAttribute('label') || element.getAttribute('xbrl:label')
      
      // label 요소 확인 (XBRL 구조)
      let labelText = labelAttr || ''
      if (!labelText) {
        const labelElement = element.querySelector('label') || element.querySelector('xbrl:label')
        labelText = labelElement?.textContent || ''
      }

      if (!labelText) continue

      // 유사도 계산
      const similarity = calculateSimilarity(labelText, targetLabels)
      if (similarity > 0.5) { // 50% 이상 유사도
        matches.push({
          element,
          similarity,
          label: labelText,
          tag: element.tagName,
        })
      }
    }

    if (matches.length === 0) {
      // Label이 없는 경우 태그명으로 유사도 검색
      return findSimilarByTagName(xmlDoc, targetLabels, fieldName)
    }

    // 가장 유사한 항목 반환
    matches.sort((a, b) => b.similarity - a.similarity)
    const bestMatch = matches[0]

    console.log(`[Semantic Parser] ${fieldName} Label 유사도 매칭: "${bestMatch.label}" (유사도: ${(bestMatch.similarity * 100).toFixed(1)}%)`)
    
    return bestMatch
  } catch (error) {
    console.warn('[Semantic Parser] Label 기반 검색 실패:', error)
    return null
  }
}

/**
 * 태그명 기반 유사도 검색
 */
function findSimilarByTagName(
  xmlDoc: Document,
  targetLabels: string[],
  fieldName: string
): SimilarityMatch | null {
  try {
    const allElements = Array.from(xmlDoc.querySelectorAll('*'))
    const matches: SimilarityMatch[] = []

    for (const element of allElements) {
      const tagName = element.tagName
      const localName = element.localName || tagName.split(':').pop() || tagName
      
      // 숫자가 포함된 요소만 검색
      const textContent = element.textContent?.trim()
      if (!textContent || !/\d/.test(textContent)) continue

      const similarity = calculateSimilarity(localName, targetLabels)
      if (similarity > 0.5) {
        matches.push({
          element,
          similarity,
          label: localName,
          tag: tagName,
        })
      }
    }

    if (matches.length === 0) return null

    matches.sort((a, b) => b.similarity - a.similarity)
    const bestMatch = matches[0]

    console.log(`[Semantic Parser] ${fieldName} 태그명 유사도 매칭: "${bestMatch.label}" (유사도: ${(bestMatch.similarity * 100).toFixed(1)}%)`)
    
    return bestMatch
  } catch (error) {
    return null
  }
}

/**
 * 유사도 계산 (간단한 문자열 유사도)
 */
function calculateSimilarity(text: string, targets: string[]): number {
  const textLower = text.toLowerCase()
  let maxSimilarity = 0

  for (const target of targets) {
    const targetLower = target.toLowerCase()
    
    // 정확 일치
    if (textLower === targetLower) {
      maxSimilarity = Math.max(maxSimilarity, 1.0)
      continue
    }

    // 포함 관계
    if (textLower.includes(targetLower) || targetLower.includes(textLower)) {
      const ratio = Math.min(textLower.length, targetLower.length) / Math.max(textLower.length, targetLower.length)
      maxSimilarity = Math.max(maxSimilarity, ratio * 0.9)
      continue
    }

    // 공통 문자 비율
    const commonChars = countCommonChars(textLower, targetLower)
    const similarity = (commonChars * 2) / (textLower.length + targetLower.length)
    maxSimilarity = Math.max(maxSimilarity, similarity)
  }

  return maxSimilarity
}

/**
 * 공통 문자 개수 계산
 */
function countCommonChars(str1: string, str2: string): number {
  const chars1 = new Set(str1.split(''))
  const chars2 = new Set(str2.split(''))
  let count = 0

  for (const char of chars1) {
    if (chars2.has(char)) {
      count++
    }
  }

  return count
}

/**
 * 한국어 키워드 매핑
 */
export const KOREAN_KEYWORDS = {
  revenue: ['매출액', '매출', '수익', 'revenue', 'sales'],
  operatingIncome: ['영업이익', '영업손익', 'operating income', 'operating profit'],
  netIncome: ['당기순이익', '순이익', 'net income', 'profit', 'loss'],
  depreciation: ['감가상각', 'depreciation'],
  amortization: ['상각', 'amortization'],
  totalAssets: ['자산총계', '총자산', 'total assets', 'assets'],
  totalLiabilities: ['부채총계', '총부채', 'total liabilities', 'liabilities'],
  totalEquity: ['자본총계', '총자본', 'total equity', 'equity'],
}
