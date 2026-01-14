/**
 * PDF 표 파싱 엔진
 * PDF 내부의 재무제표 표 구조를 인식하여 추출
 */

import type { FinancialStatement, FinancialItem } from '@/types/financial'

/**
 * 숫자 값을 FinancialItem으로 변환
 */
function createFinancialItemFromValue(
  value: number,
  name: string,
  originalName: string
): FinancialItem {
  return {
    name,
    originalName,
    source: 'DART' as const,
    standard: 'IFRS' as const,
    value,
    unit: 'KRW',
  }
}

/**
 * PDF 텍스트에서 표 구조를 인식하여 재무제표 추출
 */
export function extractFinancialTablesFromPDFText(
  pdfText: string,
  fileName: string
): FinancialStatement | null {
  try {
    // 표 구조 패턴 인식 (더 정교한 파싱)
    const tablePatterns = {
      // 한국어 표 형식
      korean: {
        revenue: /매출액[:\s]*([\d,]+)\s*(억|만|천|원)?/i,
        operatingIncome: /영업이익[:\s]*([\d,]+)\s*(억|만|천|원)?/i,
        netIncome: /당기순이익[:\s]*([\d,]+)\s*(억|만|천|원)?/i,
        totalAssets: /자산총계[:\s]*([\d,]+)\s*(억|만|천|원)?/i,
        totalLiabilities: /부채총계[:\s]*([\d,]+)\s*(억|만|천|원)?/i,
        totalEquity: /자본총계[:\s]*([\d,]+)\s*(억|만|천|원)?/i,
        operatingCashFlow: /영업현금흐름[:\s]*([\d,]+)\s*(억|만|천|원)?/i,
      },
      // 영어 표 형식
      english: {
        revenue: /Revenue[:\s]*([\d,]+)\s*(billion|million|thousand)?/i,
        operatingIncome: /Operating\s+Income[:\s]*([\d,]+)\s*(billion|million|thousand)?/i,
        netIncome: /Net\s+Income[:\s]*([\d,]+)\s*(billion|million|thousand)?/i,
        totalAssets: /Total\s+Assets[:\s]*([\d,]+)\s*(billion|million|thousand)?/i,
        totalLiabilities: /Total\s+Liabilities[:\s]*([\d,]+)\s*(billion|million|thousand)?/i,
        totalEquity: /Total\s+Equity[:\s]*([\d,]+)\s*(billion|million|thousand)?/i,
        operatingCashFlow: /Operating\s+Cash\s+Flow[:\s]*([\d,]+)\s*(billion|million|thousand)?/i,
      },
    }

    // 표 형식 감지 (한국어/영어)
    const isKorean = /[가-힣]/.test(pdfText)
    const patterns = isKorean ? tablePatterns.korean : tablePatterns.english

    // 각 항목 추출
    const extractValue = (pattern: RegExp, unitMultiplier: Record<string, number>): number => {
      const match = pdfText.match(pattern)
      if (!match) return 0

      const valueStr = match[1]?.replace(/,/g, '') || '0'
      const unit = match[2]?.toLowerCase() || ''
      let value = parseFloat(valueStr)

      if (isNaN(value)) return 0

      // 단위 변환
      if (unit && unitMultiplier[unit]) {
        value *= unitMultiplier[unit]
      }

      return value
    }

    const koreanMultiplier = {
      '억': 100000000,
      '만': 10000,
      '천': 1000,
      '원': 1,
    }

    const englishMultiplier = {
      'billion': 1000000000,
      'million': 1000000,
      'thousand': 1000,
    }

    const multiplier = isKorean ? koreanMultiplier : englishMultiplier

    // 재무제표 데이터 추출
    const revenue = extractValue(patterns.revenue, multiplier)
    const operatingIncome = extractValue(patterns.operatingIncome, multiplier)
    const netIncome = extractValue(patterns.netIncome, multiplier)
    const totalAssets = extractValue(patterns.totalAssets, multiplier)
    const totalLiabilities = extractValue(patterns.totalLiabilities, multiplier)
    const totalEquity = extractValue(patterns.totalEquity, multiplier)
    const operatingCashFlow = extractValue(patterns.operatingCashFlow, multiplier)

    // 표 형식 데이터 추출 (행/열 구조 인식)
    const tableData = extractTableStructure(pdfText, isKorean)

    // 표 데이터가 있으면 우선 사용
    const finalRevenue = tableData.revenue || revenue
    const finalOperatingIncome = tableData.operatingIncome || operatingIncome
    const finalNetIncome = tableData.netIncome || netIncome
    const finalTotalAssets = tableData.totalAssets || totalAssets
    const finalTotalLiabilities = tableData.totalLiabilities || totalLiabilities
    const finalTotalEquity = tableData.totalEquity || totalEquity
    const finalOperatingCashFlow = tableData.operatingCashFlow || operatingCashFlow

    // 유효성 검사
    if (finalRevenue === 0 && finalTotalAssets === 0) {
      return null
    }

    // 파일명에서 연도 추출
    const yearMatch = fileName.match(/(\d{4})/)
    const fiscalYear = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear()

    const financialStatement: FinancialStatement = {
      companyName: 'Unknown',
      ticker: '',
      country: 'KR',
      fiscalYear,
      quarter: 0,
      incomeStatement: {
        revenue: createFinancialItemFromValue(finalRevenue, '매출액', 'Revenue'),
        operatingIncome: createFinancialItemFromValue(finalOperatingIncome, '영업이익', 'Operating Income'),
        netIncome: createFinancialItemFromValue(finalNetIncome, '당기순이익', 'Net Income'),
        // EPS: 선택적 필드 - 찾지 못하면 undefined (0으로 채우지 않음)
        eps: undefined,
        // 감가상각비: 선택적 필드 - 찾지 못하면 undefined (0으로 채우지 않음)
        depreciationAndAmortization: undefined,
        operatingCashFlow: createFinancialItemFromValue(finalOperatingCashFlow, '영업현금흐름', 'Operating Cash Flow'),
      },
      balanceSheet: {
        totalAssets: createFinancialItemFromValue(finalTotalAssets, '자산총계', 'Total Assets'),
        totalLiabilities: createFinancialItemFromValue(finalTotalLiabilities, '부채총계', 'Total Liabilities'),
        totalEquity: createFinancialItemFromValue(finalTotalEquity, '자본총계', 'Total Equity'),
      },
      cashFlowStatement: {
        operatingCashFlow: createFinancialItemFromValue(finalOperatingCashFlow, '영업현금흐름', 'Operating Cash Flow'),
        investingCashFlow: createFinancialItemFromValue(0, '투자현금흐름', 'Investing Cash Flow'),
        financingCashFlow: createFinancialItemFromValue(0, '재무현금흐름', 'Financing Cash Flow'),
        capitalExpenditure: createFinancialItemFromValue(0, 'CAPEX', 'Capital Expenditure'),
        freeCashFlow: createFinancialItemFromValue(0, 'FCF', 'Free Cash Flow'),
      },
    }

    return financialStatement
  } catch (error) {
    console.warn('[PDF Table Extractor] 표 추출 실패:', error)
    return null
  }
}

/**
 * 표 구조 추출 (행/열 인식)
 */
function extractTableStructure(
  pdfText: string,
  isKorean: boolean
): Partial<{
  revenue: number
  operatingIncome: number
  netIncome: number
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  operatingCashFlow: number
}> {
  const result: Partial<{
    revenue: number
    operatingIncome: number
    netIncome: number
    totalAssets: number
    totalLiabilities: number
    totalEquity: number
    operatingCashFlow: number
  }> = {}

  // 표 형식 감지 (공백으로 구분된 열)
  const lines = pdfText.split('\n')
  
  // 표 헤더 찾기
  let tableStartIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase()
    if (
      (isKorean && (line.includes('매출액') || line.includes('자산총계'))) ||
      (!isKorean && (line.includes('revenue') || line.includes('total assets')))
    ) {
      tableStartIndex = i
      break
    }
  }

  if (tableStartIndex === -1) {
    return result
  }

  // 표 데이터 추출 (다음 50줄)
  const tableLines = lines.slice(tableStartIndex, tableStartIndex + 50)
  
  for (const line of tableLines) {
    // 숫자가 포함된 행만 처리
    if (!/\d/.test(line)) continue

    // 공백 또는 탭으로 구분된 열 추출
    const columns = line.split(/\s{2,}|\t/).filter(col => col.trim())
    
    if (columns.length < 2) continue

    // 첫 번째 열이 라벨, 나머지가 값
    const label = columns[0].toLowerCase()
    const valueStr = columns[columns.length - 1].replace(/,/g, '').replace(/[^\d.-]/g, '')
    const value = parseFloat(valueStr)

    if (isNaN(value)) continue

    // 라벨 매칭
    if (isKorean) {
      if (label.includes('매출액') || label.includes('매출')) {
        result.revenue = value * 1000000 // 기본 단위 가정
      } else if (label.includes('영업이익')) {
        result.operatingIncome = value * 1000000
      } else if (label.includes('당기순이익') || label.includes('순이익')) {
        result.netIncome = value * 1000000
      } else if (label.includes('자산총계') || label.includes('총자산')) {
        result.totalAssets = value * 1000000
      } else if (label.includes('부채총계') || label.includes('총부채')) {
        result.totalLiabilities = value * 1000000
      } else if (label.includes('자본총계') || label.includes('총자본')) {
        result.totalEquity = value * 1000000
      } else if (label.includes('영업현금흐름')) {
        result.operatingCashFlow = value * 1000000
      }
    } else {
      if (label.includes('revenue') || label.includes('sales')) {
        result.revenue = value * 1000000
      } else if (label.includes('operating income')) {
        result.operatingIncome = value * 1000000
      } else if (label.includes('net income')) {
        result.netIncome = value * 1000000
      } else if (label.includes('total assets')) {
        result.totalAssets = value * 1000000
      } else if (label.includes('total liabilities')) {
        result.totalLiabilities = value * 1000000
      } else if (label.includes('total equity')) {
        result.totalEquity = value * 1000000
      } else if (label.includes('operating cash flow')) {
        result.operatingCashFlow = value * 1000000
      }
    }
  }

  return result
}
