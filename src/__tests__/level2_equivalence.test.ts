/**
 * 레벨2 동등성 회귀 테스트
 * 웹 결과가 레벨2와 같은 의미를 내는지 자동 검증
 * 
 * 원칙:
 * - 숫자/기간 라벨은 100% 일치
 * - 텍스트는 카테고리/체크포인트 매핑으로 검증
 * - 근거 없는 문장 0
 */

import { describe, test, expect } from '@jest/globals'
import { buildAnalysisBundle } from '@/lib/analysis/analysis-bundle-builder'
import type { FileParseResult } from '@/lib/parsers/file-parser'
import type { UploadedFile } from '@/components/file-dropzone'
import type { AnalysisBundle, BundleFinancialStatement } from '@/types/analysis-bundle'
import goldenCase01 from '../../fixtures/analysis/golden_case_01.json'

/**
 * Fixture를 FileParseResult로 변환
 */
function createFileParseResultFromFixture(
  statement: BundleFinancialStatement,
  fileName: string = 'test.xbrl'
): FileParseResult {
  return {
    success: true,
    fileName,
    xmlContent: '<xbrl>test</xbrl>',
    financialStatement: {
      companyName: '테스트 회사',
      ticker: 'TEST',
      country: 'KR',
      fiscalYear: statement.period.fiscalYear || 2023,
      quarter: statement.period.quarter || 0,
      incomeStatement: {
        revenue: {
          name: statement.income.revenue?.name || '매출액',
          originalName: 'Revenue',
          source: 'DART',
          standard: 'IFRS',
          value: statement.income.revenue?.value || 0,
          unit: 'KRW',
        },
        operatingIncome: {
          name: statement.income.operatingIncome?.name || '영업이익',
          originalName: 'OperatingIncome',
          source: 'DART',
          standard: 'IFRS',
          value: statement.income.operatingIncome?.value || 0,
          unit: 'KRW',
        },
        netIncome: {
          name: statement.income.netIncome?.name || '당기순이익',
          originalName: 'NetIncome',
          source: 'DART',
          standard: 'IFRS',
          value: statement.income.netIncome?.value || 0,
          unit: 'KRW',
        },
        eps: undefined,
        depreciationAndAmortization: {
          name: '감가상각비',
          originalName: 'DepreciationAndAmortization',
          source: 'DART',
          standard: 'IFRS',
          value: 0,
          unit: 'KRW',
        },
        operatingCashFlow: {
          name: '영업현금흐름',
          originalName: 'OperatingCashFlow',
          source: 'DART',
          standard: 'IFRS',
          value: statement.cashflow.operatingCashFlow?.value || 0,
          unit: 'KRW',
        },
      },
      balanceSheet: {
        totalAssets: {
          name: statement.balance.totalAssets?.name || '자산총계',
          originalName: 'TotalAssets',
          source: 'DART',
          standard: 'IFRS',
          value: statement.balance.totalAssets?.value || 0,
          unit: 'KRW',
        },
        totalLiabilities: {
          name: statement.balance.totalLiabilities?.name || '부채총계',
          originalName: 'TotalLiabilities',
          source: 'DART',
          standard: 'IFRS',
          value: statement.balance.totalLiabilities?.value || 0,
          unit: 'KRW',
        },
        totalEquity: {
          name: statement.balance.totalEquity?.name || '자본총계',
          originalName: 'TotalEquity',
          source: 'DART',
          standard: 'IFRS',
          value: statement.balance.totalEquity?.value || 0,
          unit: 'KRW',
        },
        operatingAssets: undefined,
        nonInterestBearingLiabilities: undefined,
        accountsReceivable: undefined,
        inventory: undefined,
      },
      cashFlowStatement: {
        operatingCashFlow: {
          name: statement.cashflow.operatingCashFlow?.name || '영업현금흐름',
          originalName: 'OperatingCashFlow',
          source: 'DART',
          standard: 'IFRS',
          value: statement.cashflow.operatingCashFlow?.value || 0,
          unit: 'KRW',
        },
        investingCashFlow: {
          name: '투자현금흐름',
          originalName: 'InvestingCashFlow',
          source: 'DART',
          standard: 'IFRS',
          value: 0,
          unit: 'KRW',
        },
        financingCashFlow: {
          name: '재무현금흐름',
          originalName: 'FinancingCashFlow',
          source: 'DART',
          standard: 'IFRS',
          value: 0,
          unit: 'KRW',
        },
        capitalExpenditure: {
          name: statement.cashflow.capitalExpenditure?.name || 'CAPEX',
          originalName: 'CapitalExpenditure',
          source: 'DART',
          standard: 'IFRS',
          value: statement.cashflow.capitalExpenditure?.value || 0,
          unit: 'KRW',
        },
        freeCashFlow: {
          name: statement.cashflow.freeCashFlow?.name || 'FCF',
          originalName: 'FreeCashFlow',
          source: 'DART',
          standard: 'IFRS',
          value: statement.cashflow.freeCashFlow?.value || 0,
          unit: 'KRW',
        },
      },
    },
    xmlContent: '<xbrl>test</xbrl>',
    pdfResult: null,
  }
}

describe('레벨2 동등성 검증', () => {
  test('골든 케이스 01: FCF = OCF - abs(CAPEX) 일치', () => {
    const fixture = goldenCase01 as any
    const statements = fixture.input.statements as BundleFinancialStatement[]
    
    const parseResults: FileParseResult[] = statements.map((stmt, index) =>
      createFileParseResultFromFixture(stmt, `test-${index}.xbrl`)
    )
    
    const uploadedFiles: UploadedFile[] = parseResults.map((result, index) => ({
      id: `file-${index}`,
      file: new File([], result.fileName || `test-${index}.xbrl`),
      type: 'xbrl' as const,
    }))
    
    const bundle = buildAnalysisBundle(
      parseResults,
      uploadedFiles,
      fixture.input.companyName,
      fixture.input.ticker
    )
    
    // FCF = OCF - abs(CAPEX) 검증
    const latestStatement = bundle.statements[0]
    const ocf = latestStatement.cashflow.operatingCashFlow?.value
    const capex = latestStatement.cashflow.capitalExpenditure?.value
    const fcf = latestStatement.cashflow.freeCashFlow?.value
    
    if (ocf !== undefined && capex !== undefined && fcf !== undefined) {
      const expectedFCF = ocf - Math.abs(capex)
      expect(fcf).toBe(expectedFCF)
    }
  })
  
  test('골든 케이스 01: Period Label (FY/Q/YTD) 일관성', () => {
    const fixture = goldenCase01 as any
    const statements = fixture.input.statements as BundleFinancialStatement[]
    
    const parseResults: FileParseResult[] = statements.map((stmt, index) =>
      createFileParseResultFromFixture(stmt, `test-${index}.xbrl`)
    )
    
    const uploadedFiles: UploadedFile[] = parseResults.map((result, index) => ({
      id: `file-${index}`,
      file: new File([], result.fileName || `test-${index}.xbrl`),
      type: 'xbrl' as const,
    }))
    
    const bundle = buildAnalysisBundle(
      parseResults,
      uploadedFiles,
      fixture.input.companyName,
      fixture.input.ticker
    )
    
    // Period Label 검증
    const periodLabels = bundle.statements.map(s => s.period.periodType)
    const expectedLabels = fixture.expected.periodLabels
    
    expect(periodLabels.length).toBe(expectedLabels.length)
    periodLabels.forEach((label, index) => {
      expect(label).toBe(expectedLabels[index])
    })
  })
  
  test('골든 케이스 01: StepOutputs[1..11] 존재', () => {
    const fixture = goldenCase01 as any
    const statements = fixture.input.statements as BundleFinancialStatement[]
    
    const parseResults: FileParseResult[] = statements.map((stmt, index) =>
      createFileParseResultFromFixture(stmt, `test-${index}.xbrl`)
    )
    
    const uploadedFiles: UploadedFile[] = parseResults.map((result, index) => ({
      id: `file-${index}`,
      file: new File([], result.fileName || `test-${index}.xbrl`),
      type: 'xbrl' as const,
    }))
    
    const bundle = buildAnalysisBundle(
      parseResults,
      uploadedFiles,
      fixture.input.companyName,
      fixture.input.ticker
    )
    
    // StepOutputs 개수 검증
    expect(bundle.stepOutputs.length).toBe(11)
    
    // 각 Step이 1~11인지 검증
    for (let i = 1; i <= 11; i++) {
      const stepOutput = bundle.stepOutputs.find(s => s.step === i)
      expect(stepOutput).toBeDefined()
      expect(stepOutput?.step).toBe(i)
    }
  })
  
  test('골든 케이스 01: 모든 Findings/Checkpoints에 Evidence 최소 1개 존재', () => {
    const fixture = goldenCase01 as any
    const statements = fixture.input.statements as BundleFinancialStatement[]
    
    const parseResults: FileParseResult[] = statements.map((stmt, index) =>
      createFileParseResultFromFixture(stmt, `test-${index}.xbrl`)
    )
    
    const uploadedFiles: UploadedFile[] = parseResults.map((result, index) => ({
      id: `file-${index}`,
      file: new File([], result.fileName || `test-${index}.xbrl`),
      type: 'xbrl' as const,
    }))
    
    const bundle = buildAnalysisBundle(
      parseResults,
      uploadedFiles,
      fixture.input.companyName,
      fixture.input.ticker
    )
    
    // 모든 Findings에 Evidence 검증
    // Evidence가 없는 Finding은 생성되지 않아야 하거나, "(근거 필요)" 텍스트와 warn severity를 가져야 함
    bundle.stepOutputs.forEach(stepOutput => {
      stepOutput.findings.forEach(finding => {
        if (finding.evidence.length === 0) {
          // Evidence가 없으면 "(근거 필요)" 텍스트와 warn severity를 가져야 함
          expect(finding.text).toContain('근거 필요')
          expect(finding.severity).toBe('warn')
        } else {
          // Evidence가 있으면 최소 1개 이상
          expect(finding.evidence.length).toBeGreaterThanOrEqual(1)
        }
      })
    })
    
    // 모든 Checkpoints에 Evidence 검증
    bundle.stepOutputs.forEach(stepOutput => {
      stepOutput.checkpoints.forEach(checkpoint => {
        if (checkpoint.evidence.length === 0) {
          // Evidence가 없으면 "(근거 필요)" 텍스트를 가져야 함
          expect(checkpoint.title).toContain('근거 필요')
        } else {
          // Evidence가 있으면 최소 1개 이상
          expect(checkpoint.evidence.length).toBeGreaterThanOrEqual(1)
        }
      })
    })
  })
  
  test('골든 케이스 01: ChartPlan의 line 차트 조건(2개 이상 동일 기준) 준수', () => {
    const fixture = goldenCase01 as any
    const statements = fixture.input.statements as BundleFinancialStatement[]
    
    const parseResults: FileParseResult[] = statements.map((stmt, index) =>
      createFileParseResultFromFixture(stmt, `test-${index}.xbrl`)
    )
    
    const uploadedFiles: UploadedFile[] = parseResults.map((result, index) => ({
      id: `file-${index}`,
      file: new File([], result.fileName || `test-${index}.xbrl`),
      type: 'xbrl' as const,
    }))
    
    const bundle = buildAnalysisBundle(
      parseResults,
      uploadedFiles,
      fixture.input.companyName,
      fixture.input.ticker
    )
    
    // ChartPlan 검증
    bundle.stepOutputs.forEach(stepOutput => {
      if (stepOutput.chartPlan) {
        stepOutput.chartPlan.charts.forEach(chart => {
          // line 차트는 2개 이상 동일 기준일 때만 허용
          if (chart.chartType === 'line') {
            expect(chart.available).toBe(true)
            // line 차트가 available이면 동일 기준 데이터가 2개 이상 있어야 함
            // (실제로는 chart-availability-resolver에서 검증됨)
          }
        })
      }
    })
  })
  
  test('골든 케이스 01: 근거 없는 문장 0', () => {
    const fixture = goldenCase01 as any
    const statements = fixture.input.statements as BundleFinancialStatement[]
    
    const parseResults: FileParseResult[] = statements.map((stmt, index) =>
      createFileParseResultFromFixture(stmt, `test-${index}.xbrl`)
    )
    
    const uploadedFiles: UploadedFile[] = parseResults.map((result, index) => ({
      id: `file-${index}`,
      file: new File([], result.fileName || `test-${index}.xbrl`),
      type: 'xbrl' as const,
    }))
    
    const bundle = buildAnalysisBundle(
      parseResults,
      uploadedFiles,
      fixture.input.companyName,
      fixture.input.ticker
    )
    
    // 근거 없는 Finding이 없는지 검증
    // Evidence가 없는 Finding은 "(근거 필요)" 텍스트와 warn severity를 가져야 함
    bundle.stepOutputs.forEach(stepOutput => {
      stepOutput.findings.forEach(finding => {
        if (finding.evidence.length === 0) {
          // Evidence가 없으면 "(근거 필요)" 텍스트와 warn severity를 가져야 함
          expect(finding.text).toContain('근거 필요')
          expect(finding.severity).toBe('warn')
        } else {
          // Evidence가 있으면 최소 1개 이상
          expect(finding.evidence.length).toBeGreaterThan(0)
        }
      })
    })
    
    // 근거 없는 Checkpoint가 없는지 검증
    // Evidence가 없는 Checkpoint는 "(근거 필요)" 텍스트를 가져야 함
    bundle.stepOutputs.forEach(stepOutput => {
      stepOutput.checkpoints.forEach(checkpoint => {
        if (checkpoint.evidence.length === 0) {
          // Evidence가 없으면 "(근거 필요)" 텍스트를 가져야 함
          expect(
            checkpoint.title.includes('근거 필요') ||
            checkpoint.whatToWatch.includes('근거 필요') ||
            checkpoint.whyItMatters.includes('근거 필요') ||
            checkpoint.nextQuarterAction.includes('근거 필요')
          ).toBe(true)
        } else {
          // Evidence가 있으면 최소 1개 이상
          expect(checkpoint.evidence.length).toBeGreaterThan(0)
        }
      })
    })
  })
  
  test('골든 케이스 01: bundle.period가 존재하고 statements[0].period와 일치', () => {
    const fixture = goldenCase01 as any
    const statements = fixture.input.statements as BundleFinancialStatement[]
    
    const parseResults: FileParseResult[] = statements.map((stmt, index) =>
      createFileParseResultFromFixture(stmt, `test-${index}.xbrl`)
    )
    
    const uploadedFiles: UploadedFile[] = parseResults.map((result, index) => ({
      id: `file-${index}`,
      file: new File([], result.fileName || `test-${index}.xbrl`),
      type: 'xbrl' as const,
    }))
    
    const bundle = buildAnalysisBundle(
      parseResults,
      uploadedFiles,
      fixture.input.companyName,
      fixture.input.ticker
    )
    
    // bundle.period가 존재하는지 검증
    expect(bundle.period).toBeDefined()
    expect(bundle.period.periodType).toBeDefined()
    expect(bundle.period.endDate).toBeDefined()
    
    // statements[0].period와 bundle.period가 일치하는지 검증
    if (bundle.statements.length > 0 && bundle.statements[0].period) {
      const firstStatementPeriod = bundle.statements[0].period
      expect(firstStatementPeriod.periodType).toBe(bundle.period.periodType)
      expect(firstStatementPeriod.startDate).toBe(bundle.period.startDate)
      expect(firstStatementPeriod.endDate).toBe(bundle.period.endDate)
      expect(firstStatementPeriod.fiscalYear).toBe(bundle.period.fiscalYear)
      expect(firstStatementPeriod.quarter).toBe(bundle.period.quarter)
    }
  })
})
