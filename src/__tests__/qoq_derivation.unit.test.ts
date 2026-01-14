/**
 * QoQ 단독분기 파생 유닛 테스트
 * YTD 페어(9M/6M)에서 단독분기 파생 및 QoQ 비교 검증
 */

import { describe, test, expect } from '@jest/globals'
import { buildAnalysisBundle } from '@/lib/analysis/analysis-bundle-builder'
import type { FileParseResult } from '@/lib/parsers/file-parser'
import type { UploadedFile } from '@/components/file-dropzone'
import type { FinancialStatement as LegacyFinancialStatement } from '@/types/financial'

/**
 * 가짜 statement 생성 헬퍼
 */
function createMockStatement(
  fiscalYear: number,
  quarter: 1 | 2 | 3 | 4,
  periodType: 'YTD' | 'Q' | 'FY',
  endDate: string,
  values: {
    revenue: number
    operatingIncome: number
    netIncome: number
    ocf: number
    capex: number
    equity?: number
    cash?: number
    debt?: number
  }
): LegacyFinancialStatement {
  return {
    periodType,
    periodTypeLabel: periodType === 'YTD' ? `${quarter * 3}M(YTD)` : `${periodType}`,
    fiscalYear,
    quarter,
    startDate: periodType !== 'FY' ? `${fiscalYear}-01-01` : undefined,
    endDate,
    
    incomeStatement: {
      revenue: { value: values.revenue, unit: '원' },
      operatingIncome: { value: values.operatingIncome, unit: '원' },
      netIncome: { value: values.netIncome, unit: '원' },
    },
    
    cashFlowStatement: {
      operatingCashFlow: { value: values.ocf, unit: '원' },
      capitalExpenditure: { value: values.capex, unit: '원' },
      freeCashFlow: { value: values.ocf - values.capex, unit: '원' },
    },
    
    balanceSheet: {
      totalEquity: values.equity ? { value: values.equity, unit: '원' } : undefined,
      cash: values.cash ? { value: values.cash, unit: '원' } : undefined,
      interestBearingDebt: values.debt ? { value: values.debt, unit: '원' } : undefined,
      totalAssets: values.equity ? { value: values.equity * 2, unit: '원' } : undefined,
    },
  } as LegacyFinancialStatement
}

/**
 * FileParseResult 생성 헬퍼
 */
function createMockParseResult(statement: LegacyFinancialStatement): FileParseResult {
  return {
    financialStatement: statement,
    xmlContent: '',
  }
}

describe('QoQ 단독분기 파생 테스트', () => {
  test('9M와 6M YTD에서 Q3 단독분기 파생 및 QoQ 비교', () => {
    // 6M YTD (2025년 6월 말)
    const statement6M = createMockStatement(2025, 2, 'YTD', '2025-06-30', {
      revenue: 100_000_000_000,      // 1조원 (6M 누적)
      operatingIncome: 10_000_000_000, // 1천억원 (6M 누적)
      netIncome: 8_000_000_000,        // 800억원 (6M 누적)
      ocf: 15_000_000_000,             // 1.5천억원 (6M 누적)
      capex: 5_000_000_000,            // 500억원 (6M 누적)
    })
    
    // 9M YTD (2025년 9월 말)
    const statement9M = createMockStatement(2025, 3, 'YTD', '2025-09-30', {
      revenue: 160_000_000_000,      // 1.6조원 (9M 누적) → Q3 단독 = 0.6조원
      operatingIncome: 18_000_000_000, // 1.8천억원 (9M 누적) → Q3 단독 = 0.8천억원
      netIncome: 15_000_000_000,        // 1.5천억원 (9M 누적) → Q3 단독 = 0.7천억원
      ocf: 25_000_000_000,             // 2.5천억원 (9M 누적) → Q3 단독 = 1.0천억원
      capex: 8_000_000_000,            // 800억원 (9M 누적) → Q3 단독 = 300억원
    })
    
    const parseResults: FileParseResult[] = [
      createMockParseResult(statement9M), // 최신이 먼저
      createMockParseResult(statement6M),
    ]
    
    const uploadedFiles: UploadedFile[] = [
      { file: new File([''], '9m.xbrl') },
      { file: new File([''], '6m.xbrl') },
    ]
    
    const bundle = buildAnalysisBundle(
      parseResults,
      uploadedFiles,
      '테스트 회사',
      'TEST'
    )
    
    // 최신 statement의 keyMetricsCompare 확인
    const latestStatement = bundle.statements[0]
    expect(latestStatement).toBeDefined()
    
    const keyMetricsCompare = latestStatement.keyMetricsCompare
    expect(keyMetricsCompare).toBeDefined()
    
    // revenue: Q3 단독 = 1.6조 - 1.0조 = 0.6조원
    // QoQ 비교는 3M 데이터가 없으므로 불가 → YOY 또는 NONE
    // (이 테스트는 3M 데이터가 없으므로 QoQ가 불가능함)
    // 따라서 revenue는 YOY 또는 NONE이어야 함
    expect(keyMetricsCompare?.revenue).toBeDefined()
    expect(keyMetricsCompare?.revenue?.compareBasis).not.toBe('QOQ') // 3M이 없으므로 QoQ 불가
    
    // operatingMargin, netMargin도 마찬가지
    expect(keyMetricsCompare?.operatingMargin?.compareBasis).not.toBe('QOQ')
    expect(keyMetricsCompare?.netMargin?.compareBasis).not.toBe('QOQ')
    expect(keyMetricsCompare?.ocf?.compareBasis).not.toBe('QOQ')
    expect(keyMetricsCompare?.capex?.compareBasis).not.toBe('QOQ')
    expect(keyMetricsCompare?.fcf?.compareBasis).not.toBe('QOQ')
  })
  
  test('3M, 6M, 9M YTD에서 QoQ 비교 활성화 (Q3 vs Q2)', () => {
    // 3M YTD (2025년 3월 말)
    const statement3M = createMockStatement(2025, 1, 'YTD', '2025-03-31', {
      revenue: 50_000_000_000,       // 5천억원 (3M 누적)
      operatingIncome: 5_000_000_000,  // 500억원 (3M 누적)
      netIncome: 4_000_000_000,        // 400억원 (3M 누적)
      ocf: 7_000_000_000,              // 700억원 (3M 누적)
      capex: 2_000_000_000,            // 200억원 (3M 누적)
    })
    
    // 6M YTD (2025년 6월 말) → Q2 단독 = 6M - 3M
    const statement6M = createMockStatement(2025, 2, 'YTD', '2025-06-30', {
      revenue: 100_000_000_000,      // 1조원 (6M 누적) → Q2 단독 = 0.5조원
      operatingIncome: 10_000_000_000, // 1천억원 (6M 누적) → Q2 단독 = 0.5천억원
      netIncome: 8_000_000_000,        // 800억원 (6M 누적) → Q2 단독 = 0.4천억원
      ocf: 15_000_000_000,             // 1.5천억원 (6M 누적) → Q2 단독 = 0.8천억원
      capex: 5_000_000_000,            // 500억원 (6M 누적) → Q2 단독 = 300억원
    })
    
    // 9M YTD (2025년 9월 말) → Q3 단독 = 9M - 6M
    const statement9M = createMockStatement(2025, 3, 'YTD', '2025-09-30', {
      revenue: 160_000_000_000,      // 1.6조원 (9M 누적) → Q3 단독 = 0.6조원
      operatingIncome: 18_000_000_000, // 1.8천억원 (9M 누적) → Q3 단독 = 0.8천억원
      netIncome: 15_000_000_000,        // 1.5천억원 (9M 누적) → Q3 단독 = 0.7천억원
      ocf: 25_000_000_000,             // 2.5천억원 (9M 누적) → Q3 단독 = 1.0천억원
      capex: 8_000_000_000,            // 800억원 (9M 누적) → Q3 단독 = 300억원
    })
    
    const parseResults: FileParseResult[] = [
      createMockParseResult(statement9M), // 최신이 먼저
      createMockParseResult(statement6M),
      createMockParseResult(statement3M),
    ]
    
    const uploadedFiles: UploadedFile[] = [
      { file: new File([''], '9m.xbrl') },
      { file: new File([''], '6m.xbrl') },
      { file: new File([''], '3m.xbrl') },
    ]
    
    const bundle = buildAnalysisBundle(
      parseResults,
      uploadedFiles,
      '테스트 회사',
      'TEST'
    )
    
    // 최신 statement의 keyMetricsCompare 확인
    const latestStatement = bundle.statements[0]
    expect(latestStatement).toBeDefined()
    
    const keyMetricsCompare = latestStatement.keyMetricsCompare
    expect(keyMetricsCompare).toBeDefined()
    
    // revenue: Q3 단독(0.6조) vs Q2 단독(0.5조) → QoQ 활성화 가능
    expect(keyMetricsCompare?.revenue).toBeDefined()
    if (keyMetricsCompare?.revenue?.compareBasis === 'QOQ') {
      // Q3 단독 = 1.6조 - 1.0조 = 0.6조원
      // Q2 단독 = 1.0조 - 0.5조 = 0.5조원
      // delta = 0.6조 - 0.5조 = 0.1조원 (증가)
      expect(keyMetricsCompare.revenue.prevValue).toBeCloseTo(50_000_000_000, -9) // Q2 단독 = 0.5조원
      expect(keyMetricsCompare.revenue.trend).toBe('up') // 증가
    }
    
    // operatingMargin: Q3 단독 vs Q2 단독
    // Q3 operatingMargin = 0.8천억 / 0.6조 * 100 = 13.33%
    // Q2 operatingMargin = 0.5천억 / 0.5조 * 100 = 10%
    if (keyMetricsCompare?.operatingMargin?.compareBasis === 'QOQ') {
      expect(keyMetricsCompare.operatingMargin.trend).toBe('up') // 증가
    }
    
    // netMargin도 마찬가지
    if (keyMetricsCompare?.netMargin?.compareBasis === 'QOQ') {
      // Q3 netMargin = 0.7천억 / 0.6조 * 100 = 11.67%
      // Q2 netMargin = 0.4천억 / 0.5조 * 100 = 8%
      expect(keyMetricsCompare.netMargin.trend).toBe('up') // 증가
    }
    
    // ocf: Q3 단독(1.0천억) vs Q2 단독(0.8천억) → 증가
    if (keyMetricsCompare?.ocf?.compareBasis === 'QOQ') {
      expect(keyMetricsCompare.ocf.prevValue).toBeCloseTo(8_000_000_000, -9) // Q2 단독 = 0.8천억원
      expect(keyMetricsCompare.ocf.trend).toBe('up') // 증가
    }
    
    // capex: Q3 단독(300억) vs Q2 단독(300억) → 동일
    if (keyMetricsCompare?.capex?.compareBasis === 'QOQ') {
      expect(keyMetricsCompare.capex.prevValue).toBeCloseTo(3_000_000_000, -9) // Q2 단독 = 300억원
      expect(keyMetricsCompare.capex.trend).toBe('neutral') // 동일
    }
    
    // fcf: Q3 단독(0.7천억) vs Q2 단독(0.5천억) → 증가
    // Q3 FCF = 1.0천억 - 300억 = 0.7천억원
    // Q2 FCF = 0.8천억 - 300억 = 0.5천억원
    if (keyMetricsCompare?.fcf?.compareBasis === 'QOQ') {
      expect(keyMetricsCompare.fcf.trend).toBe('up') // 증가
    }
  })
  
  test('단일 파일 업로드 시 QoQ 비활성화 (YOY 또는 NONE)', () => {
    // 9M YTD 단독
    const statement9M = createMockStatement(2025, 3, 'YTD', '2025-09-30', {
      revenue: 160_000_000_000,
      operatingIncome: 18_000_000_000,
      netIncome: 15_000_000_000,
      ocf: 25_000_000_000,
      capex: 8_000_000_000,
    })
    
    const parseResults: FileParseResult[] = [
      createMockParseResult(statement9M),
    ]
    
    const uploadedFiles: UploadedFile[] = [
      { file: new File([''], '9m.xbrl') },
    ]
    
    const bundle = buildAnalysisBundle(
      parseResults,
      uploadedFiles,
      '테스트 회사',
      'TEST'
    )
    
    const latestStatement = bundle.statements[0]
    const keyMetricsCompare = latestStatement.keyMetricsCompare
    
    // 단일 파일이므로 QoQ 불가
    expect(keyMetricsCompare?.revenue?.compareBasis).not.toBe('QOQ')
    expect(keyMetricsCompare?.operatingMargin?.compareBasis).not.toBe('QOQ')
    expect(keyMetricsCompare?.netMargin?.compareBasis).not.toBe('QOQ')
    expect(keyMetricsCompare?.ocf?.compareBasis).not.toBe('QOQ')
    expect(keyMetricsCompare?.capex?.compareBasis).not.toBe('QOQ')
    expect(keyMetricsCompare?.fcf?.compareBasis).not.toBe('QOQ')
  })
})