/**
 * 파일 매핑 유틸리티
 * 파일명 분석하여 연도, 보고서 유형, 분기 정보 추출
 */

import { extractYearFromFileName, extractReportType } from './file-utils'

export interface FileMetadata {
  fileName: string
  year: number | null
  reportType: string
  quarter: number | null
  displayName: string
}

/**
 * 파일 목록에서 메타데이터 추출 및 분류
 */
export function mapFilesToMetadata(files: Array<{ file: File; name: string }>): FileMetadata[] {
  return files.map(file => {
    const year = extractYearFromFileName(file.name)
    const reportType = extractReportType(file.name)
    const quarter = extractQuarterFromFileName(file.name)
    
    return {
      fileName: file.name,
      year,
      reportType,
      quarter,
      displayName: formatDisplayName(year, reportType, quarter),
    }
  })
}

/**
 * 파일명에서 분기 추출
 */
function extractQuarterFromFileName(fileName: string): number | null {
  const fileNameLower = fileName.toLowerCase()
  
  // 분기 패턴: "1분기", "Q1", "1Q" 등
  const quarterPatterns = [
    /(\d)분기/,
    /[Qq](\d)/,
    /(\d)[Qq]/,
  ]

  for (const pattern of quarterPatterns) {
    const match = fileNameLower.match(pattern)
    if (match) {
      const quarter = parseInt(match[1])
      if (quarter >= 1 && quarter <= 4) {
        return quarter
      }
    }
  }

  return null
}

/**
 * 표시 이름 포맷팅
 */
function formatDisplayName(
  year: number | null,
  reportType: string,
  quarter: number | null
): string {
  if (year && quarter) {
    return `${year}년 ${quarter}분기 ${reportType}`
  } else if (year) {
    return `${year}년 ${reportType}`
  } else if (quarter) {
    return `${quarter}분기 ${reportType}`
  }
  return reportType
}

/**
 * 누락된 연도 감지
 */
export function detectMissingYears(
  fileMetadata: FileMetadata[],
  targetYears: number[] = []
): number[] {
  // 파일에서 추출된 연도 목록
  const existingYears = fileMetadata
    .map(f => f.year)
    .filter((year): year is number => year !== null)
    .sort((a, b) => a - b)

  // 목표 연도가 지정되지 않았으면 최근 5년 기준
  if (targetYears.length === 0) {
    const currentYear = new Date().getFullYear()
    targetYears = Array.from({ length: 5 }, (_, i) => currentYear - i)
  }

  // 누락된 연도 찾기
  const missingYears = targetYears.filter(year => !existingYears.includes(year))

  return missingYears
}

/**
 * 파일 메타데이터를 연도별로 그룹화
 */
export function groupFilesByYear(
  fileMetadata: FileMetadata[]
): Map<number, FileMetadata[]> {
  const grouped = new Map<number, FileMetadata[]>()

  for (const metadata of fileMetadata) {
    if (metadata.year !== null) {
      if (!grouped.has(metadata.year)) {
        grouped.set(metadata.year, [])
      }
      grouped.get(metadata.year)!.push(metadata)
    }
  }

  return grouped
}
