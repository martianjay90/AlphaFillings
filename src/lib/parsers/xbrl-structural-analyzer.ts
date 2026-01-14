/**
 * XBRL 구조적 위치 분석기
 * 재무제표의 구조적 위치를 분석하여 데이터를 역추적
 */

/**
 * 구조적 위치 정보
 */
export interface StructuralLocation {
  /** 부모 요소 태그명 */
  parentTag?: string
  
  /** 형제 요소 태그명 목록 */
  siblingTags?: string[]
  
  /** 컨텍스트 ID */
  contextId?: string
  
  /** 단위 ID */
  unitId?: string
  
  /** 요소의 텍스트 내용 (일부) */
  textContent?: string
}

/**
 * 구조적 위치로 재무제표 항목 찾기
 */
export function findFinancialItemByStructure(
  xmlDoc: Document,
  fieldName: string,
  structuralHints: {
    parentTags?: string[]
    siblingTags?: string[]
    contextPatterns?: string[]
  }
): Element | null {
  try {
    // 1. 부모 태그로 검색
    if (structuralHints.parentTags) {
      for (const parentTag of structuralHints.parentTags) {
        const parentElements = xmlDoc.querySelectorAll(parentTag)
        for (const parent of Array.from(parentElements)) {
          // 자식 요소 중 숫자가 포함된 요소 찾기
          const children = Array.from(parent.children)
          for (const child of children) {
            const text = child.textContent?.trim() || ''
            if (/\d/.test(text) && !isNaN(parseFloat(text.replace(/,/g, '')))) {
              // 구조적 위치가 맞는지 확인
              if (matchesStructuralHints(child, structuralHints)) {
                return child
              }
            }
          }
        }
      }
    }

    // 2. 형제 태그로 검색
    if (structuralHints.siblingTags) {
      for (const siblingTag of structuralHints.siblingTags) {
        const siblings = xmlDoc.querySelectorAll(siblingTag)
        for (const sibling of Array.from(siblings)) {
          // 형제 요소의 다음/이전 요소 확인
          const nextSibling = sibling.nextElementSibling
          const prevSibling = sibling.previousElementSibling
          
          if (nextSibling && matchesFieldName(nextSibling, fieldName)) {
            return nextSibling
          }
          if (prevSibling && matchesFieldName(prevSibling, fieldName)) {
            return prevSibling
          }
        }
      }
    }

    // 3. 컨텍스트 패턴으로 검색
    if (structuralHints.contextPatterns) {
      for (const contextPattern of structuralHints.contextPatterns) {
        const contextElements = xmlDoc.querySelectorAll(`[contextRef*="${contextPattern}"]`)
        for (const element of Array.from(contextElements)) {
          if (matchesFieldName(element, fieldName)) {
            return element
          }
        }
      }
    }

    return null
  } catch (error) {
    console.warn('[Structural Analyzer] 구조적 분석 실패:', error)
    return null
  }
}

/**
 * 필드명과 일치하는지 확인
 */
function matchesFieldName(element: Element, fieldName: string): boolean {
  const tagName = element.tagName.toLowerCase()
  const localName = tagName.split(':').pop() || tagName
  const fieldNameLower = fieldName.toLowerCase()
  
  // Local Name 기반 매칭
  return localName.includes(fieldNameLower) || 
         fieldNameLower.includes(localName) ||
         tagName.includes(fieldNameLower)
}

/**
 * 구조적 힌트와 일치하는지 확인
 */
function matchesStructuralHints(
  element: Element,
  hints: { parentTags?: string[]; siblingTags?: string[] }
): boolean {
  // 부모 태그 확인
  if (hints.parentTags) {
    let parent = element.parentElement
    while (parent) {
      const parentTag = parent.tagName.toLowerCase()
      if (hints.parentTags.some(hint => parentTag.includes(hint.toLowerCase()))) {
        return true
      }
      parent = parent.parentElement
    }
  }

  // 형제 태그 확인
  if (hints.siblingTags) {
    const siblings = Array.from(element.parentElement?.children || [])
    const siblingTags = siblings.map(s => s.tagName.toLowerCase())
    if (hints.siblingTags.some(hint => 
      siblingTags.some(st => st.includes(hint.toLowerCase()))
    )) {
      return true
    }
  }

  return false
}

/**
 * XML 문서의 구조적 위치 정보 추출
 */
export function extractStructuralLocation(element: Element): StructuralLocation {
  const parent = element.parentElement
  const siblings = Array.from(parent?.children || [])
  
  return {
    parentTag: parent?.tagName,
    siblingTags: siblings.map(s => s.tagName),
    contextId: element.getAttribute('contextRef') || undefined,
    unitId: element.getAttribute('unitRef') || undefined,
    textContent: element.textContent?.substring(0, 100), // 처음 100자만
  }
}

/**
 * 원문 일부 추출 (로그용)
 */
export function extractOriginalTextSnippet(
  xmlDoc: Document,
  fieldName: string,
  maxLength: number = 500
): string {
  try {
    // 관련 태그가 포함된 부분 찾기
    const allElements = Array.from(xmlDoc.querySelectorAll('*'))
    
    for (const element of allElements) {
      const tagName = element.tagName.toLowerCase()
      const localName = tagName.split(':').pop() || tagName
      
      if (localName.includes(fieldName.toLowerCase()) || 
          fieldName.toLowerCase().includes(localName)) {
        // 부모 요소의 XML 일부 추출
        const parent = element.parentElement
        if (parent) {
          const serializer = new XMLSerializer()
          const xmlString = serializer.serializeToString(parent)
          return xmlString.substring(0, maxLength)
        }
      }
    }

    // 전체 문서의 일부 반환
    const serializer = new XMLSerializer()
    const xmlString = serializer.serializeToString(xmlDoc.documentElement)
    return xmlString.substring(0, maxLength)
  } catch (error) {
    console.warn('[Structural Analyzer] 원문 추출 실패:', error)
    return ''
  }
}
