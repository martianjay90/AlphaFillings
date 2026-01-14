/**
 * 파일 유틸리티 함수
 * 파일명에서 연도, 회사명 등을 추출
 */

/**
 * 파일명에서 연도 추출
 */
export function extractYearFromFileName(fileName: string): number | null {
  // 다양한 패턴 시도
  const patterns = [
    /(\d{4})/, // 4자리 숫자
    /20(\d{2})/, // 20XX 형식
    /(\d{4})년/, // "2023년" 형식
  ]

  for (const pattern of patterns) {
    const match = fileName.match(pattern)
    if (match) {
      const year = parseInt(match[1] || match[0])
      if (year >= 2000 && year <= 2100) {
        return year
      }
    }
  }

  return null
}

/**
 * 파일명에서 보고서 유형 추출
 */
export function extractReportType(fileName: string): string {
  const fileNameLower = fileName.toLowerCase()
  
  if (fileNameLower.includes('사업보고서') || fileNameLower.includes('annual')) {
    return '사업보고서'
  }
  if (fileNameLower.includes('분기보고서') || fileNameLower.includes('quarterly')) {
    return '분기보고서'
  }
  if (fileNameLower.includes('반기보고서') || fileNameLower.includes('semi-annual')) {
    return '반기보고서'
  }
  
  return '보고서'
}

/**
 * 파일명에서 회사명 추출 (개선된 로직)
 * 우선순위:
 * 1) [기업명] 패턴 추출 (예: "[LG전자]...")
 * 2) 파일명 시작 부분 (언더스코어/하이픈 기준)
 * 3) 기본값: "기업명 미확인"
 */
export function extractCompanyName(fileName: string): string {
  if (!fileName || fileName.trim() === '') {
    return '기업명 미확인'
  }
  
  // 파일명에서 확장자 제거
  const nameWithoutExt = fileName.replace(/\.(pdf|xml|xbrl|zip)$/i, '').trim()
  
  // 1) [기업명] 패턴 추출 (예: "[LG전자] 2024 사업보고서")
  const bracketMatch = nameWithoutExt.match(/\[([^\]]+)\]/)
  if (bracketMatch && bracketMatch[1]) {
    const extracted = bracketMatch[1].trim()
    if (extracted.length > 0 && extracted.length < 50) {
      return extracted
    }
  }
  
  // 2) 파일명 시작 부분에서 회사명 추출
  // 언더스코어, 하이픈, 공백으로 분리된 첫 번째 토큰 사용
  const patterns = [
    /^([^_\-\s]+)/, // 언더스코어/하이픈/공백 이전 부분
    /^([가-힣\w\s]+?)(?:\s*[\[\(]|\s+\d{4}|\s+사업보고서|\s+분기보고서)/i, // 특정 키워드 이전
  ]
  
  for (const pattern of patterns) {
    const match = nameWithoutExt.match(pattern)
    if (match && match[1]) {
      const extracted = match[1].trim()
      // 합리적인 길이 체크 (2자 이상, 50자 미만)
      if (extracted.length >= 2 && extracted.length < 50) {
        // 숫자만 있는 경우 제외
        if (!/^\d+$/.test(extracted)) {
          return extracted
        }
      }
    }
  }
  
  // 3) 연도와 특수문자 제거 후 남은 부분 사용
  const withoutYear = nameWithoutExt.replace(/\d{4}/g, '').replace(/\s*년/g, '')
  const cleaned = withoutYear
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*(사업보고서|분기보고서|반기보고서|보고서)\s*/gi, '')
    .trim()
  
  if (cleaned.length >= 2 && cleaned.length < 50 && !/^\d+$/.test(cleaned)) {
    return cleaned
  }
  
  return '기업명 미확인'
}
