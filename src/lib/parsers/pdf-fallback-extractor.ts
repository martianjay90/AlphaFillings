/**
 * PDF Fallback 추출 로직
 * XBRL이 없을 경우 PDF 내부의 재무제표 표를 텍스트 파싱으로 추출
 */

import type { FinancialStatement, FinancialItem } from '@/types/financial'
import { extractFinancialTablesFromPDFText } from './pdf-table-extractor'

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
 * PDF 텍스트에서 재무제표 표 추출
 * 개선된 표 파싱 엔진 사용
 */
export function extractFinancialTablesFromPDF(
  pdfText: string,
  fileName: string = 'unknown.pdf'
): FinancialStatement | null {
  // 먼저 개선된 표 파싱 엔진 시도
  const tableResult = extractFinancialTablesFromPDFText(pdfText, fileName)
  if (tableResult) {
    return tableResult
  }

  // Fallback: 기존 텍스트 파싱 로직
  try {
    // 재무제표 관련 키워드 찾기
    const financialKeywords = [
      '재무상태표', '손익계산서', '현금흐름표',
      '자산', '부채', '자본', '매출액', '영업이익', '당기순이익',
      'Total Assets', 'Total Liabilities', 'Revenue', 'Operating Income', 'Net Income'
    ]

    // 재무제표 섹션 찾기
    let financialSection = ''
    const lines = pdfText.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase()
      if (financialKeywords.some(keyword => line.includes(keyword.toLowerCase()))) {
        // 재무제표 섹션 추출 (다음 100줄)
        financialSection = lines.slice(i, i + 100).join('\n')
        break
      }
    }

    if (!financialSection) {
      return null
    }

    // 숫자 추출 (금액, 비율 등)
    const numbers = extractNumbersFromText(financialSection)
    
    // 기본 재무제표 구조 생성
    const revenueValue = extractValue(numbers, ['매출액', 'Revenue', '매출'])
    const totalAssetsValue = extractValue(numbers, ['자산총계', 'Total Assets', '총자산'])
    
    const financialStatement: FinancialStatement = {
      companyName: 'Unknown',
      ticker: '',
      country: 'KR',
      fiscalYear: new Date().getFullYear(),
      quarter: 0,
      incomeStatement: {
        revenue: createFinancialItemFromValue(revenueValue, '매출액', 'Revenue'),
        operatingIncome: createFinancialItemFromValue(extractValue(numbers, ['영업이익', 'Operating Income', '영업손익']), '영업이익', 'Operating Income'),
        netIncome: createFinancialItemFromValue(extractValue(numbers, ['당기순이익', 'Net Income', '순이익']), '당기순이익', 'Net Income'),
        // EPS: 선택적 필드 - 찾지 못하면 undefined (0으로 채우지 않음)
        eps: (() => {
          const epsValue = extractValue(numbers, ['주당순이익', 'EPS', 'Earnings Per Share'])
          return epsValue > 0 ? createFinancialItemFromValue(epsValue, '주당순이익', 'EPS') : undefined
        })(),
        // 감가상각비: 선택적 필드 - 찾지 못하면 undefined (0으로 채우지 않음)
        depreciationAndAmortization: (() => {
          const daValue = extractValue(numbers, ['감가상각', 'Depreciation', 'D&A', '감가상각비'])
          return daValue > 0 ? createFinancialItemFromValue(daValue, '감가상각비', 'Depreciation & Amortization') : undefined
        })(),
        operatingCashFlow: createFinancialItemFromValue(extractValue(numbers, ['영업현금흐름', 'Operating Cash Flow', 'OCF']) || 0, '영업현금흐름', 'Operating Cash Flow'),
      },
      balanceSheet: {
        totalAssets: createFinancialItemFromValue(totalAssetsValue, '자산총계', 'Total Assets'),
        totalLiabilities: createFinancialItemFromValue(extractValue(numbers, ['부채총계', 'Total Liabilities', '총부채']), '부채총계', 'Total Liabilities'),
        totalEquity: createFinancialItemFromValue(extractValue(numbers, ['자본총계', 'Total Equity', '총자본']), '자본총계', 'Total Equity'),
        operatingAssets: extractValue(numbers, ['유형자산', 'Property', 'PPE']) > 0 
          ? createFinancialItemFromValue(extractValue(numbers, ['유형자산', 'Property', 'PPE']), '영업자산', 'Operating Assets')
          : undefined,
        nonInterestBearingLiabilities: extractValue(numbers, ['무이자부채', 'Trade Payables']) > 0
          ? createFinancialItemFromValue(extractValue(numbers, ['무이자부채', 'Trade Payables']), '비이자발생부채', 'Non-interest Bearing Liabilities')
          : undefined,
        accountsReceivable: extractValue(numbers, ['매출채권', 'Receivables']) > 0
          ? createFinancialItemFromValue(extractValue(numbers, ['매출채권', 'Receivables']), '매출채권', 'Accounts Receivable')
          : undefined,
        inventory: extractValue(numbers, ['재고자산', 'Inventory']) > 0
          ? createFinancialItemFromValue(extractValue(numbers, ['재고자산', 'Inventory']), '재고자산', 'Inventory')
          : undefined,
      },
      cashFlowStatement: {
        operatingCashFlow: createFinancialItemFromValue(extractValue(numbers, ['영업현금흐름', 'Operating Cash Flow', 'OCF']), '영업현금흐름', 'Operating Cash Flow'),
        investingCashFlow: createFinancialItemFromValue(extractValue(numbers, ['투자현금흐름', 'Investing Cash Flow']) || 0, '투자현금흐름', 'Investing Cash Flow'),
        financingCashFlow: createFinancialItemFromValue(extractValue(numbers, ['재무현금흐름', 'Financing Cash Flow']) || 0, '재무현금흐름', 'Financing Cash Flow'),
        capitalExpenditure: createFinancialItemFromValue(0, 'CAPEX', 'Capital Expenditure'),
        freeCashFlow: createFinancialItemFromValue(0, 'FCF', 'Free Cash Flow'),
      },
    }

    // 유효성 검사 (최소한의 데이터가 있는지 확인)
    if (
      revenueValue > 0 ||
      totalAssetsValue > 0
    ) {
      return financialStatement
    }

    return null
  } catch (error) {
    console.warn('[PDF Fallback] 재무제표 추출 실패:', error)
    return null
  }
}

/**
 * 텍스트에서 숫자 추출
 */
function extractNumbersFromText(text: string): Array<{ value: number; label: string }> {
  const numbers: Array<{ value: number; label: string }> = []
  
  // 다양한 숫자 패턴
  const patterns = [
    // 한국어 형식: "매출액: 1,234,567,890원"
    /([가-힣\w\s]+):\s*([\d,]+)\s*(억|만|천|원|%)?/g,
    // 영어 형식: "Revenue: 1,234,567,890"
    /([A-Za-z\s]+):\s*([\d,]+)\s*(million|billion|thousand|%)?/gi,
    // 표 형식: "1,234,567,890"
    /([\d,]+)\s*(억|만|천|원|%)/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const label = match[1]?.trim() || ''
      const valueStr = match[2]?.replace(/,/g, '') || match[0]?.replace(/,/g, '')
      const unit = match[3]?.toLowerCase() || ''

      let value = parseFloat(valueStr)
      if (isNaN(value)) continue

      // 단위 변환
      if (unit.includes('억')) value *= 100000000
      else if (unit.includes('만')) value *= 10000
      else if (unit.includes('천')) value *= 1000
      else if (unit.includes('billion')) value *= 1000000000
      else if (unit.includes('million')) value *= 1000000
      else if (unit.includes('thousand')) value *= 1000

      numbers.push({ value, label })
    }
  }

  return numbers
}

/**
 * 특정 라벨에 해당하는 값 추출
 */
function extractValue(
  numbers: Array<{ value: number; label: string }>,
  keywords: string[]
): number {
  for (const number of numbers) {
    const labelLower = number.label.toLowerCase()
    if (keywords.some(keyword => labelLower.includes(keyword.toLowerCase()))) {
      return number.value
    }
  }
  return 0
}
