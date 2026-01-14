/**
 * 시계열 데이터 병합 엔진
 * 10개 파일에서 결산월/회기 연도 추출 및 연도별 정렬
 */

import type { FinancialStatement } from '@/types/financial'
import { extractYearFromFileName } from '@/lib/utils/file-utils'

/**
 * FinancialHistory 타입 정의
 */
export interface FinancialHistory {
  fiscalYear: number
  fiscalMonth?: number // 결산월 (1-12)
  quarter?: number // 분기 (0 = 연간, 1-4 = 분기)
  financialStatement: FinancialStatement
}

/**
 * XBRL에서 결산월 추출
 * 가능한 후보 중 가장 최근 것을 선택
 */
export function extractFiscalMonthFromXBRL(xmlContent: string): number | null {
  try {
    // Context에서 기간 정보 추출 (전체 스캔)
    const periodPatterns = [
      /endDate[^>]*>(\d{4})-(\d{2})/gi,
      /period[^>]*>(\d{4})-(\d{2})/gi,
      /fiscalYearEnd[^>]*>(\d{4})-(\d{2})/gi,
    ]

    const monthCandidates: number[] = []

    for (const pattern of periodPatterns) {
      let match
      while ((match = pattern.exec(xmlContent)) !== null) {
        if (match[2]) {
          const month = parseInt(match[2])
          if (month >= 1 && month <= 12) {
            monthCandidates.push(month)
          }
        }
      }
    }

    if (monthCandidates.length === 0) {
      return null
    }

    // 가장 최근 월 선택 (최댓값)
    const maxMonth = Math.max(...monthCandidates)
    return maxMonth
  } catch (error) {
    console.warn('[TimeseriesMerger] 결산월 추출 실패:', error)
    return null
  }
}

/**
 * XBRL에서 회기 연도 추출
 * 가능한 후보 중 최댓값(가장 최근)을 선택
 */
export function extractFiscalYearFromXBRL(xmlContent: string): number | null {
  try {
    // Context에서 연도 정보 추출 (endDate/instant 전체를 스캔)
    const yearPatterns = [
      /endDate[^>]*>(\d{4})/gi,
      /period[^>]*>(\d{4})/gi,
      /fiscalYear[^>]*>(\d{4})/gi,
      /instant[^>]*>(\d{4})/gi,
      /startDate[^>]*>(\d{4})/gi,
    ]

    const yearCandidates: number[] = []

    for (const pattern of yearPatterns) {
      let match
      while ((match = pattern.exec(xmlContent)) !== null) {
        if (match[1]) {
          const year = parseInt(match[1])
          if (year >= 2000 && year <= 2100) {
            yearCandidates.push(year)
          }
        }
      }
    }

    if (yearCandidates.length === 0) {
      return null
    }

    // 최댓값(가장 최근 연도) 선택
    const maxYear = Math.max(...yearCandidates)
    console.log(`[TimeseriesMerger] XBRL에서 연도 추출: ${maxYear} (후보: ${yearCandidates.join(', ')})`)
    return maxYear
  } catch (error) {
    console.warn('[TimeseriesMerger] 회기 연도 추출 실패:', error)
    return null
  }
}

/**
 * 파일명에서 분기 추출
 */
export function extractQuarterFromFileName(fileName: string): number | null {
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
 * 재무제표 배열을 시계열로 병합
 */
export function mergeFinancialStatementsToHistory(
  financialStatements: FinancialStatement[],
  fileNames: string[] = [],
  xmlContents: string[] = []
): FinancialHistory[] {
  const history: FinancialHistory[] = []

  for (let i = 0; i < financialStatements.length; i++) {
    const fs = financialStatements[i]
    const fileName = fileNames[i] || ''
    const xmlContent = xmlContents[i] || ''

    // 연도 추출 (우선순위: XBRL > 파일명 > 재무제표)
    // fs.fiscalYear가 미리 채워져 있어도 XBRL/파일명 추출이 우선
    let fiscalYear = 0
    
    // 1순위: XBRL xmlContent에서 추출
    if (xmlContent) {
      const xbrlYear = extractFiscalYearFromXBRL(xmlContent)
      if (xbrlYear) {
        fiscalYear = xbrlYear
      }
    }
    
    // 2순위: 파일명에서 추출
    if (!fiscalYear && fileName) {
      const fileYear = extractYearFromFileName(fileName)
      if (fileYear) {
        fiscalYear = fileYear
      }
    }
    
    // 3순위: fs.fiscalYear (단, 0이 아니고 의미 있는 경우만)
    if (!fiscalYear && fs.fiscalYear && fs.fiscalYear > 0 && fs.fiscalYear >= 2000 && fs.fiscalYear <= 2100) {
      fiscalYear = fs.fiscalYear
    }

    // 결산월 추출
    let fiscalMonth: number | undefined = undefined
    if (xmlContent) {
      const month = extractFiscalMonthFromXBRL(xmlContent)
      if (month) fiscalMonth = month
    }

    // 분기 추출
    let quarter: number | undefined = fs.quarter || undefined
    if (!quarter && fileName) {
      const fileQuarter = extractQuarterFromFileName(fileName)
      if (fileQuarter) quarter = fileQuarter
    }

    // 재무제표에 연도 업데이트
    if (fiscalYear > 0) {
      fs.fiscalYear = fiscalYear
    }

    history.push({
      fiscalYear,
      fiscalMonth,
      quarter,
      financialStatement: fs,
    })
  }

  // 연도별로 정렬 (최신순)
  history.sort((a, b) => {
    if (a.fiscalYear !== b.fiscalYear) {
      return b.fiscalYear - a.fiscalYear // 최신순
    }
    // 같은 연도면 분기 순서 (연간 > 4분기 > 3분기 > 2분기 > 1분기)
    const quarterOrder = (q: number | undefined) => q === undefined || q === 0 ? 0 : 5 - q
    return quarterOrder(b.quarter) - quarterOrder(a.quarter)
  })

  return history
}

/**
 * FinancialHistory를 FinancialStatement 배열로 변환
 */
export function historyToFinancialStatements(history: FinancialHistory[]): FinancialStatement[] {
  return history.map(h => h.financialStatement)
}
