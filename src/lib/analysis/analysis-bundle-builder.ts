/**
 * AnalysisBundle 빌더
 * 기존 파서 결과를 AnalysisBundle로 변환
 * 레벨2 동등성 계약 준수
 */

import type
{ FinancialStatement as LegacyFinancialStatement }
from '@/types/financial'
import type
{
  AnalysisBundle,
  IndustryClassification,
  BundleFinancialStatement,
  BundleFinancialStatement as FinancialStatement,
  BundleFinancialItem as FinancialItem,
  PeriodKey,
  MoneyMeta,
  EvidenceRef,
  DerivedMetrics,
  Finding,
  Checkpoint,
  StepOutput,
  DataQuality,
  CalculationPolicy,} from '@/types/analysis-bundle'
import { CAPEX_POLICY } from '@/lib/parsers/xbrl-parser'
import type
{ FileParseResult }
from '@/lib/parsers/file-parser'
import type
{ UploadedFile }
from '@/components/file-dropzone'
import { runLevel2Steps }
from './step-engine'
import { runSelfCheck }
from './self-check'
import type { KeyMetricsCompare, KeyMetricCompare } from '@/types/key-metrics-compare'
import type { CompareReasonCode } from '@/lib/compare/reasonCodes'
import { isCompareReasonCode } from '@/lib/compare/reasonCodes'

/**
 * 파일 ID 생성
 */
function generateFileId(fileName: string, index: number): string {
  return `file-${index}-${fileName.replace(/[^a-zA-Z0-9]/g, '-')}`
}

/**
 * PeriodKey 생성
 * XBRL Parser에서 확정한 anchor 기간 정보를 단일 진실 소스(SoT)로 사용
 * xmlContent 정규식 파싱 fallback 제거 (2032 같은 잘못된 날짜 선택 방지)
 */
function createPeriodKey(
  legacy: LegacyFinancialStatement,
  xmlContent?: string
): PeriodKey {
  // === 1단계: periodType 결정 (XBRL Parser 결과 우선) ===
  let periodType: "FY" | "Q" | "YTD" = legacy.periodType
    || (legacy.quarter && legacy.quarter > 0 ? "Q" : "FY")

  // periodTypeLabel에서 YTD 확인 ("9M(YTD)", "YTD" 등)
  if (legacy.periodTypeLabel) {
    const labelLower = legacy.periodTypeLabel.toLowerCase()
    if (labelLower.includes('ytd') || labelLower.includes('누적') || labelLower.match(/\d+m\s*\(ytd\)/i)) {
      periodType = "YTD"
    } else if (labelLower.match(/q\d+\(3m\)/i) || (legacy.quarter && legacy.quarter > 0)) {
      periodType = "Q"
    } else if (labelLower === 'fy' || labelLower.includes('연간')) {
      periodType = "FY"
    }
  }

  // === 2단계: startDate/endDate 결정 (XBRL Parser에서 확정한 anchor 기간 사용, 단일 진실 소스) ===
  // 중요: xmlContent 정규식 파싱 fallback 제거 (2032 같은 잘못된 날짜 선택 방지)
  // XBRL Parser에서 확정한 anchor 기간이 없으면 경고를 로그하고 PeriodKey 반환 (buildAnalysisBundle에서 교정)
  let startDate: string | undefined = undefined
  let endDate: string | undefined = undefined

  // 최우선: XBRL Parser에서 확정한 anchor 기간 사용 (단일 진실 소스)
  if (legacy.startDate && legacy.endDate) {
    startDate = legacy.startDate
    endDate = legacy.endDate
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[AnalysisBundleBuilder] createPeriodKey: XBRL Parser anchor 기간 사용 (startDate=${startDate}, endDate=${endDate})`)
    }
  } else if (legacy.endDate) {
    // endDate만 있는 경우 (재무상태표 instant 시점 등)
    endDate = legacy.endDate
    if (periodType === 'YTD' && endDate) {
      // YTD인 경우: startDate를 해당 연도 01-01
      const targetYear = new Date(endDate).getFullYear()
      startDate = `${targetYear}-01-01`
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[AnalysisBundleBuilder] createPeriodKey: endDate 기반 YTD startDate 보정 (${startDate})`)
      }
    }
  } else {
    // XBRL Parser에서 확정한 anchor 기간이 없는 경우 (이상적인 상황이 아님)
    // fiscalYear와 periodType을 기반으로 적절한 endDate 생성 (fallback)
    if (legacy.fiscalYear && legacy.fiscalYear >= 2000 && legacy.fiscalYear <= 2100) {
      const year = legacy.fiscalYear
      if (periodType === 'FY') {
        // 연간: 해당 연도 12-31
        endDate = `${year}-12-31`
        startDate = `${year}-01-01`
      } else if (periodType === 'YTD' && legacy.quarter) {
        // YTD: 해당 분기 말일
        const quarter = legacy.quarter
        if (quarter === 1) {
          endDate = `${year}-03-31`
          startDate = `${year}-01-01`
        } else if (quarter === 2) {
          endDate = `${year}-06-30`
          startDate = `${year}-01-01`
        } else if (quarter === 3) {
          endDate = `${year}-09-30`
          startDate = `${year}-01-01`
        } else if (quarter === 4) {
          endDate = `${year}-12-31`
          startDate = `${year}-01-01`
        }
      } else if (periodType === 'Q' && legacy.quarter) {
        // 분기: 해당 분기 말일
        const quarter = legacy.quarter
        if (quarter === 1) {
          endDate = `${year}-03-31`
          startDate = `${year}-01-01`
        } else if (quarter === 2) {
          endDate = `${year}-06-30`
          startDate = `${year}-04-01`
        } else if (quarter === 3) {
          endDate = `${year}-09-30`
          startDate = `${year}-07-01`
        } else if (quarter === 4) {
          endDate = `${year}-12-31`
          startDate = `${year}-10-01`
        }
      }
      
      if (endDate) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[AnalysisBundleBuilder] createPeriodKey: fiscalYear 기반 endDate 생성 (fiscalYear=${year}, periodType=${periodType}, endDate=${endDate})`)
        }
      } else {
        console.warn(`[AnalysisBundleBuilder] createPeriodKey: XBRL Parser에서 확정한 anchor 기간이 없고, fiscalYear 기반 fallback도 실패했습니다. (startDate=${legacy.startDate || 'N/A'}, endDate=${legacy.endDate || 'N/A'})`)
      }
    } else {
      console.warn(`[AnalysisBundleBuilder] createPeriodKey: XBRL Parser에서 확정한 anchor 기간이 없습니다. (startDate=${legacy.startDate || 'N/A'}, endDate=${legacy.endDate || 'N/A'})`)
      console.warn(`[AnalysisBundleBuilder] xmlContent 정규식 파싱 fallback은 더 이상 사용하지 않습니다 (2032 같은 잘못된 날짜 선택 방지). buildAnalysisBundle의 방어 로직에서 교정하니 확인하세요.`)
    }
  }

  // === 3단계: fiscalYear 계산 (endDate 기반으로 명확히 계산) ===
  let fiscalYear: number | undefined = undefined
  if (legacy.fiscalYear && legacy.fiscalYear > 0 && legacy.fiscalYear >= 2000 && legacy.fiscalYear <= 2100) {
    // XBRL Parser에서 확정한 fiscalYear 사용 (단일 진실 소스)
    fiscalYear = legacy.fiscalYear
  } else if (endDate) {
    // endDate 기반으로 fiscalYear 계산 (fallback)
    const endYear = new Date(endDate).getFullYear()
    if (endYear >= 2000 && endYear <= 2100) {
      fiscalYear = endYear
    }
  }

  // === 4단계: quarter 계산 (endDate 기반으로 명확히 계산) ===
  let quarter: 1 | 2 | 3 | 4 | undefined = undefined
  if (legacy.quarter && legacy.quarter > 0 && legacy.quarter <= 4) {
    // XBRL Parser에서 확정한 quarter 사용 (단일 진실 소스)
    quarter = legacy.quarter as 1 | 2 | 3 | 4
  } else if (endDate) {
    // endDate 기반으로 quarter 계산 (명확한 규칙)
    // 예: endDate=2025-09-30이면 quarter=3 (9M(YTD) 또는 Q3)
    const endMonth = new Date(endDate).getMonth() + 1 // 1-12
    if (endMonth >= 1 && endMonth <= 3) {
      quarter = 1 // Q1: 1월~3월 종료
    } else if (endMonth >= 4 && endMonth <= 6) {
      quarter = 2 // Q2: 4월~6월 종료
    } else if (endMonth >= 7 && endMonth <= 9) {
      quarter = 3 // Q3: 7월~9월 종료 (9M(YTD) 또는 Q3)
    } else if (endMonth >= 10 && endMonth <= 12) {
      quarter = 4 // Q4: 10월~12월 종료
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[AnalysisBundleBuilder] createPeriodKey: quarter 계산 (endDate=${endDate}, endMonth=${endMonth}, quarter=${quarter})`)
    }
  }

  const periodKey: PeriodKey = {
    fiscalYear, // endDate 기반으로 계산 (XBRL Parser에서 확정한 값 우선)
    quarter, // endDate 기반으로 계산 (XBRL Parser에서 확정한 값 우선)
    periodType, // XBRL Parser에서 확정한 값
    startDate, // XBRL Parser에서 확정한 anchor 기간 시작일 (단일 진실 소스)
    endDate,   // XBRL Parser에서 확정한 anchor 기간 종료일 (단일 진실 소스)
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[AnalysisBundleBuilder] createPeriodKey 최종 결과:`, {
      periodType: periodKey.periodType,
      startDate: periodKey.startDate || 'N/A',
      endDate: periodKey.endDate || 'N/A',
      quarter: periodKey.quarter || 'N/A',
      fiscalYear: periodKey.fiscalYear || 'N/A'
    })
  }

  return periodKey
}

/**
 * MoneyMeta 생성
 */
function createMoneyMeta(legacyItem: { unit: string }): MoneyMeta {
  const unit = legacyItem.unit || 'KRW'

  // 단위 변환
  let normalizedUnit: MoneyMeta['unit'] = '원'
  if (unit.includes('USD') || unit === 'USD') {
    normalizedUnit = 'USD'
  } else if (unit.includes('million') || unit.includes('백만')) {
    normalizedUnit = unit.includes('USD') ? 'millionUSD' : '백만원'
  } else if (unit.includes('억')) {
    normalizedUnit = '억원'
  } else if (unit.includes('thousand')) {
    normalizedUnit = 'thousandUSD'
  }

  return {
    currency: unit.includes('USD') ? 'USD' : 'KRW',
    unit: normalizedUnit,
    signConvention: 'asReported',
  }
}

/**
 * EvidenceRef 생성 (XBRL)
 * 내부 디버그용으로만 사용
 * 사용자 화면에는 표시하지 않음
 */
function createXBRLEvidence(
  fileId: string,
  tag?: string,
  contextRef?: string,
  quote?: string
): EvidenceRef {
  // 내부 디버그 로그 (개발 환경에서만)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.debug('[XBRL Evidence] 생성:', {
      fileId,
      tag,
      contextRef,
      quote,
      note: 'XBRL 근거는 내부 디버그용이며 사용자 화면에는 표시하지 않습니다.',
    })
  }
  return {
    sourceType: 'XBRL',
    fileId,
    locator: {
      tag,
      contextRef,
    },
    quote,
  }
}

/**
 * EvidenceRef 생성 (PDF)
 */
function createPDFEvidence(
  fileId: string,
  page?: number,
  lineHint?: string,
  quote?: string
): EvidenceRef {
  return {
    sourceType: 'PDF',
    fileId,
    locator: {
      page,
      lineHint,
    },
    quote,
  }
}

/**
 * Legacy FinancialItem을 AnalysisBundle BundleFinancialItem으로 변환
 */
function convertFinancialItem(
  legacyItem: { name: string; value: number; unit: string; originalName?: string },
  evidence?: EvidenceRef[]
): FinancialItem {
  // 값이 NaN이면 undefined로 처리 (데이터가 없음으로 간주)
  // 0은 유효한 값일 수 있으므로 제거하지 않음 (CAPEX가 실제로 0인 경우 등)
  // legacyItem이 존재하는 것은 이미 값이 있다는 것이므로, 0도 유효한 값으로 처리
  const value = !isNaN(legacyItem.value) ? legacyItem.value : undefined

  return {
    name: legacyItem.name,
    value,
    meta: createMoneyMeta(legacyItem),
    evidence: evidence || [],
  }
}

/**
 * Legacy FinancialStatement를 AnalysisBundle BundleFinancialStatement로 변환
 */
function convertFinancialStatement(
  legacy: LegacyFinancialStatement,
  fileId: string,
  xmlContent?: string
): FinancialStatement {
  const period = createPeriodKey(legacy, xmlContent)

  // 손익계산서 변환
  const income: Record<string, FinancialItem> = {}
  if (legacy.incomeStatement.revenue) {
    income.revenue = convertFinancialItem(
      legacy.incomeStatement.revenue,
      [createXBRLEvidence(fileId, 'ifrs-full:Revenue', undefined, `매출: ${legacy.incomeStatement.revenue.value}`)]
    )
  }
  if (legacy.incomeStatement.revenuePrevYear) {
    income.revenuePrevYear = convertFinancialItem(
      legacy.incomeStatement.revenuePrevYear,
      [createXBRLEvidence(fileId, 'ifrs-full:Revenue', undefined, `작년 같은 기간 매출: ${legacy.incomeStatement.revenuePrevYear.value}`)]
    )
  }
  if (legacy.incomeStatement.operatingIncome) {
    income.operatingIncome = convertFinancialItem(
      legacy.incomeStatement.operatingIncome,
      [createXBRLEvidence(fileId, 'ifrs-full:OperatingIncome', undefined, `영업이익: ${legacy.incomeStatement.operatingIncome.value}`)]
    )
  }
  if (legacy.incomeStatement.operatingIncomePrevYear) {
    income.operatingIncomePrevYear = convertFinancialItem(
      legacy.incomeStatement.operatingIncomePrevYear,
      [createXBRLEvidence(fileId, 'ifrs-full:OperatingIncome', undefined, `작년 같은 기간 영업이익: ${legacy.incomeStatement.operatingIncomePrevYear.value}`)]
    )
  }
  if (legacy.incomeStatement.netIncome) {
    income.netIncome = convertFinancialItem(
      legacy.incomeStatement.netIncome,
      [createXBRLEvidence(fileId, 'ifrs-full:ProfitLoss', undefined, `당기순이익: ${legacy.incomeStatement.netIncome.value}`)]
    )
  }
  if (legacy.incomeStatement.netIncomePrevYear) {
    income.netIncomePrevYear = convertFinancialItem(
      legacy.incomeStatement.netIncomePrevYear,
      [createXBRLEvidence(fileId, 'ifrs-full:ProfitLoss', undefined, `작년 같은 기간 당기순이익: ${legacy.incomeStatement.netIncomePrevYear.value}`)]
    )
  }
  // EPS: 선택적 필드 (ifrs-full:BasicEarningsLossPerShare 우선 탐색)
  if (legacy.incomeStatement.eps) {
    income.eps = convertFinancialItem(
      legacy.incomeStatement.eps,
      [createXBRLEvidence(fileId, 'ifrs-full:BasicEarningsLossPerShare', undefined, `EPS: ${legacy.incomeStatement.eps.value}`)]
    )
  }
  // 감가상각비: 선택적 필드 (ifrs-full:DepreciationAndAmortisationExpense 우선 탐색)
  if (legacy.incomeStatement.depreciationAndAmortization) {
    income.depreciationAndAmortization = convertFinancialItem(
      legacy.incomeStatement.depreciationAndAmortization,
      [createXBRLEvidence(fileId, 'ifrs-full:DepreciationAndAmortisationExpense', undefined, `감가상각비: ${legacy.incomeStatement.depreciationAndAmortization.value}`)]
    )
  }

  // 현금흐름표 변환
  const cashflow: Record<string, FinancialItem> = {}
  if (legacy.cashFlowStatement.operatingCashFlow) {
    cashflow.operatingCashFlow = convertFinancialItem(
      legacy.cashFlowStatement.operatingCashFlow,
      [createXBRLEvidence(fileId, 'ifrs-full:CashFlowsFromOperatingActivities', undefined, `영업현금흐름: ${legacy.cashFlowStatement.operatingCashFlow.value}`)]
    )
  }
  if (legacy.cashFlowStatement.ocfPrevYear) {
    cashflow.ocfPrevYear = convertFinancialItem(
      legacy.cashFlowStatement.ocfPrevYear,
      [createXBRLEvidence(fileId, 'ifrs-full:CashFlowsFromOperatingActivities', undefined, `작년 같은 기간 영업현금흐름: ${legacy.cashFlowStatement.ocfPrevYear.value}`)]
    )
  }
  if (legacy.cashFlowStatement.capitalExpenditure) {
    // CAPEX는 선택적 필드 (정책 결과)
    cashflow.capitalExpenditure = convertFinancialItem(
      legacy.cashFlowStatement.capitalExpenditure,
      [createXBRLEvidence(fileId, 'ifrs-full:PaymentsToAcquirePropertyPlantAndEquipment', undefined, `CAPEX: ${legacy.cashFlowStatement.capitalExpenditure.value}`)]
    )
  }
  if (legacy.cashFlowStatement.capitalExpenditurePrevYear) {
    cashflow.capitalExpenditurePrevYear = convertFinancialItem(
      legacy.cashFlowStatement.capitalExpenditurePrevYear,
      [createXBRLEvidence(fileId, 'ifrs-full:PaymentsToAcquirePropertyPlantAndEquipment', undefined, `작년 같은 기간 CAPEX: ${legacy.cashFlowStatement.capitalExpenditurePrevYear.value}`)]
    )
  }
  if (legacy.cashFlowStatement.capexPPE) {
    // CAPEX PPE는 선택적 필드 (구조적 분리)
    cashflow.capexPPE = convertFinancialItem(
      legacy.cashFlowStatement.capexPPE,
      [createXBRLEvidence(fileId, 'ifrs-full:PaymentsToAcquirePropertyPlantAndEquipment', undefined, `CAPEX PPE: ${legacy.cashFlowStatement.capexPPE.value}`)]
    )
  }
  if (legacy.cashFlowStatement.capexIntangible) {
    // CAPEX Intangible은 선택적 필드 (구조적 분리)
    cashflow.capexIntangible = convertFinancialItem(
      legacy.cashFlowStatement.capexIntangible,
      [createXBRLEvidence(fileId, 'ifrs-full:PaymentsToAcquireIntangibleAssets', undefined, `CAPEX Intangible: ${legacy.cashFlowStatement.capexIntangible.value}`)]
    )
  }
  if (legacy.cashFlowStatement.freeCashFlow) {
    cashflow.freeCashFlow = convertFinancialItem(
      legacy.cashFlowStatement.freeCashFlow,
      [createXBRLEvidence(fileId, undefined, undefined, `FCF: ${legacy.cashFlowStatement.freeCashFlow.value} (계산값)`)]
    )
  }
  if (legacy.cashFlowStatement.investingCashFlow) {
    cashflow.investingCashFlow = convertFinancialItem(
      legacy.cashFlowStatement.investingCashFlow,
      [createXBRLEvidence(fileId, 'ifrs-full:CashFlowsFromInvestingActivities', undefined, `투자현금흐름: ${legacy.cashFlowStatement.investingCashFlow.value}`)]
    )
  }
  if (legacy.cashFlowStatement.financingCashFlow) {
    cashflow.financingCashFlow = convertFinancialItem(
      legacy.cashFlowStatement.financingCashFlow,
      [createXBRLEvidence(fileId, 'ifrs-full:CashFlowsFromFinancingActivities', undefined, `재무현금흐름: ${legacy.cashFlowStatement.financingCashFlow.value}`)]
    )
  }

  // 재무상태표 변환
  const balance: Record<string, FinancialItem> = {}
  if (legacy.balanceSheet.totalAssets) {
    balance.totalAssets = convertFinancialItem(
      legacy.balanceSheet.totalAssets,
      [createXBRLEvidence(fileId, 'ifrs-full:Assets', undefined, `자산총계: ${legacy.balanceSheet.totalAssets.value}`)]
    )
  }
  if (legacy.balanceSheet.totalLiabilities) {
    balance.totalLiabilities = convertFinancialItem(
      legacy.balanceSheet.totalLiabilities,
      [createXBRLEvidence(fileId, 'ifrs-full:Liabilities', undefined, `부채총계: ${legacy.balanceSheet.totalLiabilities.value}`)]
    )
  }
  if (legacy.balanceSheet.totalEquity) {
    balance.totalEquity = convertFinancialItem(
      legacy.balanceSheet.totalEquity,
      [createXBRLEvidence(fileId, 'ifrs-full:Equity', undefined, `자본총계: ${legacy.balanceSheet.totalEquity.value}`)]
    )
  }
  if (legacy.balanceSheet.operatingAssets) {
    balance.operatingAssets = convertFinancialItem(
      legacy.balanceSheet.operatingAssets,
      [createXBRLEvidence(fileId, undefined, undefined, `영업자산: ${legacy.balanceSheet.operatingAssets.value}`)]
    )
  }
  if (legacy.balanceSheet.nonInterestBearingLiabilities) {
    balance.nonInterestBearingLiabilities = convertFinancialItem(
      legacy.balanceSheet.nonInterestBearingLiabilities,
      [createXBRLEvidence(fileId, undefined, undefined, `비이자발생부채: ${legacy.balanceSheet.nonInterestBearingLiabilities.value}`)]
    )
  }
  if (legacy.balanceSheet.accountsReceivable) {
    balance.accountsReceivable = convertFinancialItem(
      legacy.balanceSheet.accountsReceivable,
      [createXBRLEvidence(fileId, 'ifrs-full:TradeReceivables', undefined, `매출채권: ${legacy.balanceSheet.accountsReceivable.value}`)]
    )
  }
  if (legacy.balanceSheet.inventory) {
    balance.inventory = convertFinancialItem(
      legacy.balanceSheet.inventory,
      [createXBRLEvidence(fileId, 'ifrs-full:Inventories', undefined, `재고자산: ${legacy.balanceSheet.inventory.value}`)]
    )
  }
  if (legacy.balanceSheet.cash) {
    balance.cash = convertFinancialItem(
      legacy.balanceSheet.cash,
      [createXBRLEvidence(fileId, 'ifrs-full:CashAndCashEquivalents', undefined, `현금및현금성자산: ${legacy.balanceSheet.cash.value}`)]
    )
  }
  if (legacy.balanceSheet.interestBearingDebt) {
    balance.interestBearingDebt = convertFinancialItem(
      legacy.balanceSheet.interestBearingDebt,
      [createXBRLEvidence(fileId, 'ifrs-full:Borrowings', undefined, `이자발생부채: ${legacy.balanceSheet.interestBearingDebt.value}`)]
    )
  }
  if (legacy.balanceSheet.equityPriorEnd) {
    balance.equityPriorEnd = convertFinancialItem(
      legacy.balanceSheet.equityPriorEnd,
      [createXBRLEvidence(fileId, 'ifrs-full:Equity', undefined, `전기말 자본총계: ${legacy.balanceSheet.equityPriorEnd.value}`)]
    )
  }
  if (legacy.balanceSheet.cashPriorEnd) {
    balance.cashPriorEnd = convertFinancialItem(
      legacy.balanceSheet.cashPriorEnd,
      [createXBRLEvidence(fileId, 'ifrs-full:CashAndCashEquivalents', undefined, `전기말 현금및현금성자산: ${legacy.balanceSheet.cashPriorEnd.value}`)]
    )
  }
  if (legacy.balanceSheet.debtPriorEnd) {
    balance.debtPriorEnd = convertFinancialItem(
      legacy.balanceSheet.debtPriorEnd,
      [createXBRLEvidence(fileId, 'ifrs-full:Borrowings', undefined, `전기말 이자발생부채: ${legacy.balanceSheet.debtPriorEnd.value}`)]
    )
  }
  if (legacy.balanceSheet.netCashPriorEnd) {
    balance.netCashPriorEnd = convertFinancialItem(
      legacy.balanceSheet.netCashPriorEnd,
      [createXBRLEvidence(fileId, undefined, undefined, `전기말 순현금/순차입금: ${legacy.balanceSheet.netCashPriorEnd.value}`)]
    )
  }

  return {
    period,
    income,
    cashflow,
    balance,
  }
}

/**
 * DerivedMetrics 계산 결과와 데이터 품질 정보
 */
interface DerivedMetricsWithQuality {
  metrics: DerivedMetrics;
  missingConcepts: string[];
  blockedMetrics: string[];
}

/**
 * DerivedMetrics 계산
 * 영업이익률 계산 시 기간 일치 검증 강제 (기간 혼입 방지)
 * ROIC 간이 계산: Equity + InterestBearingDebt - Cash
 */
function calculateDerivedMetrics(
  statement: BundleFinancialStatement,
  originalStatement: LegacyFinancialStatement | undefined, // 원본 FinancialStatement (기간 정보용)
  warnings: string[]
): DerivedMetricsWithQuality {
  const missingConcepts: string[] = []
  const blockedMetrics: string[] = []
  const revenue = statement.income.revenue?.value
  const operatingIncome = statement.income.operatingIncome?.value
  const ocf = statement.cashflow.operatingCashFlow?.value
  const capex = statement.cashflow.capitalExpenditure?.value
  const fcf = statement.cashflow.freeCashFlow?.value

  // 영업이익률 계산 (기간 일치 검증 강제)
  let opm: number | undefined = undefined
  if (revenue !== undefined && revenue !== null && operatingIncome !== undefined && operatingIncome !== null && revenue !== 0) {
    // 기간 일치 검증: 원본 FinancialStatement의 periodType과 periodTypeLabel 확인
    // 참고: xbrl-parser에서 이미 기간 필터링을 적용했으므로, 여기서는 추가 검증으로 신뢰성 강화
    const periodType = originalStatement?.periodType
    const periodTypeLabel = originalStatement?.periodTypeLabel

    // 개발 모드에서 기간 정보 및 선택된 fact 로깅
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DerivedMetrics] === 영업이익률 계산 시작 ===`)
      console.log(`[DerivedMetrics] periodType=${periodType || 'N/A'}, periodTypeLabel=${periodTypeLabel || 'N/A'}`)
      console.log(`[DerivedMetrics] 매출=${revenue.toLocaleString()}, 영업이익=${operatingIncome.toLocaleString()}`)
    }

    // 영업이익률 계산
    const calculatedOpm = (operatingIncome / revenue) * 100

    // 비정상 수치 방지: 영업이익률은 일반적으로 -50% ~ 50% 범위
    // 다만 5.0% 같은 값도 정상 범위이므로 기간 혼입 여부는 다른 방법으로 검증해야 함
    if (calculatedOpm >= -50 && calculatedOpm <= 50) {
      // 개발 모드에서 계산값 로깅
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DerivedMetrics] 영업이익률 계산 완료: ${calculatedOpm.toFixed(2)}% (반올림 ${calculatedOpm.toFixed(1)}%)`)
        console.log(`[DerivedMetrics] 기간 정보 확인: periodType=${periodType || 'N/A'}, periodTypeLabel=${periodTypeLabel || 'N/A'}`)
        console.log(`[DerivedMetrics] 참고: xbrl-parser에서 이미 anchor 기간 필터링이 적용되었으므로, 매출과 영업이익은 같은 기간을 사용합니다.`)
      }
      opm = calculatedOpm
    } else {
      console.warn(`[DerivedMetrics] 영업이익률 비정상 수치 감지: ${calculatedOpm.toFixed(2)}% (영업이익: ${operatingIncome.toLocaleString()}, 매출: ${revenue.toLocaleString()})`)
      console.warn(`[DerivedMetrics] 기간 정보: periodType=${periodType || 'N/A'}, periodTypeLabel=${periodTypeLabel || 'N/A'}`)
      warnings.push(`영업이익률 계산 불가: 비정상 수치 감지 (${calculatedOpm.toFixed(2)}%). 기간 혼입 가능성.`)
    }
  } else {
    if (revenue === undefined || revenue === null) {
      warnings.push('영업이익률 계산 불가: 매출액이 없습니다 (null/undefined)')
    }
    if (operatingIncome === undefined || operatingIncome === null) {
      warnings.push('영업이익률 계산 불가: 영업이익 값이 없습니다 (null/undefined)')
    }
  }

  // FCF 마진 계산 (null 처리 강화, CAPEX가 없으면 FCF도 null로 계산 불가)
  let fcfMargin: number | undefined = undefined
  if (revenue !== undefined && revenue !== null && fcf !== undefined && fcf !== null && revenue !== 0) {
    const calculatedFcfMargin = (fcf / revenue) * 100
    // 비정상 수치 방지: FCF 마진은 일반적으로 -100% ~ 100% 범위
    if (calculatedFcfMargin >= -100 && calculatedFcfMargin <= 100) {
      fcfMargin = calculatedFcfMargin
    } else {
      console.warn(`[DerivedMetrics] FCF 마진 비정상 수치 감지: ${calculatedFcfMargin.toFixed(2)}% (FCF: ${fcf}, 매출: ${revenue})`)
      warnings.push(`FCF 마진 계산 불가: 비정상 수치 감지 (${calculatedFcfMargin.toFixed(2)}%)`)
    }
  } else {
    if (revenue === undefined || revenue === null) {
      warnings.push('FCF 마진 계산 불가: 매출액이 없습니다 (null/undefined)')
    }
    if (fcf === undefined || fcf === null) {
      // CAPEX가 없어서 FCF가 계산되지 않은 경우 명시적으로 안내
      const hasCapex = statement.cashflow.capitalExpenditure?.value !== undefined && statement.cashflow.capitalExpenditure?.value !== null
      if (!hasCapex) {
        warnings.push('FCF 마진 계산 불가: CAPEX(자본적 지출)가 없어서 이로 인해 FCF 계산 불가')
      } else {
        warnings.push('FCF 마진 계산 불가: FCF 값이 없습니다 (null/undefined)')
      }
    }
  }

  // ROIC 계산 (간이 방법: Equity + InterestBearingDebt - Cash)
  // 기존 방법(OperatingAssets - NonInterestBearingLiabilities) 대신 공시 기반 간이 계산 사용
  let roic: number | undefined = undefined
  let investedCapital: number | undefined = undefined
  
  const equity = statement.balance.totalEquity?.value
  const interestBearingDebt = statement.balance.interestBearingDebt?.value
  const cash = statement.balance.cash?.value
  const operatingIncomeForRoic = operatingIncome
  
  // 간이 투하자본 계산: Equity + InterestBearingDebt - Cash
  // 부족한 개념 추적
  if (equity === undefined || equity === null) {
    missingConcepts.push('Equity')
  }
  if (interestBearingDebt === undefined || interestBearingDebt === null) {
    missingConcepts.push('InterestBearingDebt')
  }
  if (cash === undefined || cash === null) {
    missingConcepts.push('Cash')
  }
  
  if (equity !== undefined && equity !== null && 
      interestBearingDebt !== undefined && interestBearingDebt !== null && 
      cash !== undefined && cash !== null &&
      operatingIncomeForRoic !== undefined && operatingIncomeForRoic !== null) {
    // 모든 필수 데이터가 있으면 계산 시도
    investedCapital = equity + interestBearingDebt - cash

    // 투하자본 검증: 0보다 크고 합리적인 범위여야 함
    if (investedCapital > 0 && Math.abs(investedCapital) < 1e15) { // 1천조 이하
      // NOPAT 계산 (간이: 영업이익 * (1 - 세율))
      // 세율 기본값 0.25 (25%), 법인세비용/세전이익이 있으면 추정 가능하지만 1차 버전에서는 기본값 사용
      const taxRate = 0.25 // 기본값
      const nopat = operatingIncomeForRoic * (1 - taxRate)
      const calculatedRoic = (nopat / investedCapital) * 100

      // 비정상 수치 방지: ROIC는 일반적으로 -100% ~ 200% 범위
      if (calculatedRoic >= -100 && calculatedRoic <= 200) {
        roic = calculatedRoic
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[DerivedMetrics] ROIC 간이 계산 완료: ${calculatedRoic.toFixed(2)}% (NOPAT=${nopat.toLocaleString()}, InvestedCapital=${investedCapital.toLocaleString()})`)
        }
      } else {
        console.warn(`[DerivedMetrics] ROIC 비정상 수치 감지: ${calculatedRoic.toFixed(2)}% (NOPAT: ${nopat}, 투하자본: ${investedCapital})`)
        warnings.push(`ROIC 계산 불가: 비정상 수치 감지 (${calculatedRoic.toFixed(2)}%). 컨텍스트 선택 오류 가능성.`)
        roic = undefined
        investedCapital = undefined
        blockedMetrics.push('ROIC')
      }
    } else {
      if (investedCapital <= 0) {
        warnings.push('ROIC 계산 불가: 투하자본이 0 이하입니다.')
        investedCapital = undefined
        blockedMetrics.push('ROIC')
        blockedMetrics.push('InvestedCapital')
      } else {
        warnings.push('ROIC 계산 불가: 투하자본 값이 비정상적으로 큽니다(컨텍스트 선택 오류 가능성)')
        investedCapital = undefined
        blockedMetrics.push('ROIC')
        blockedMetrics.push('InvestedCapital')
      }
    }
  } else {
    // 필수 데이터 부족
    blockedMetrics.push('ROIC')
    blockedMetrics.push('InvestedCapital')
    if (operatingIncomeForRoic === undefined || operatingIncomeForRoic === null) {
      warnings.push('ROIC 계산 불가: 영업이익 값이 없습니다')
      missingConcepts.push('OperatingIncome')
    }
  }

  return {
    metrics: {
      revenue,
      operatingIncome,
      ocf,
      capex,
      fcf,
      opm,
      fcfMargin,
      roic,
      investedCapital, // 간이 계산된 투하자본
      evidence: [], // TODO: 파생 지표 계산 근거 추출
    },
    missingConcepts,
    blockedMetrics,
  }
}

/**
 * KeyMetricsCompare 계산
 * 11개 핵심 지표의 비교 기준, 이전 값, 변화량, 트렌드 계산
 * 에러 발생 시 빈 객체 반환 (방어적 프로그래밍)
 */
function calculateKeyMetricsCompare(
  latestStatement: BundleFinancialStatement,
  latestDerived: DerivedMetrics,
  allStatements: BundleFinancialStatement[]
): KeyMetricsCompare {
  try {
    // 방어적 체크: latestStatement가 유효한지 확인
    if (!latestStatement || !latestStatement.period) {
      console.warn('[calculateKeyMetricsCompare] latestStatement가 유효하지 않습니다.')
      return {}
    }

    // 방어적 체크: allStatements가 유효한지 확인
    if (!allStatements || !Array.isArray(allStatements)) {
      console.warn('[calculateKeyMetricsCompare] allStatements가 유효하지 않습니다.')
      return {}
    }

    const compare: KeyMetricsCompare = {}

  // 현재 값 추출
  const revenue = latestStatement.income?.revenue?.value ?? undefined
  const operatingIncome = latestStatement.income?.operatingIncome?.value ?? undefined
  const netIncome = latestStatement.income?.netIncome?.value ?? undefined
  const ocf = latestStatement.cashflow?.operatingCashFlow?.value ?? undefined
  const capex = latestStatement.cashflow?.capitalExpenditure?.value ?? undefined
  const fcf = latestStatement.cashflow?.freeCashFlow?.value ?? undefined
  const equity = latestStatement.balance?.totalEquity?.value ?? undefined
  const cash = latestStatement.balance?.cash?.value ?? undefined
  const debt = latestStatement.balance?.interestBearingDebt?.value ?? undefined

  // 계산된 지표 (derived에서 가져오거나 계산)
  const operatingMargin = latestDerived?.opm
  const netMargin = netIncome !== undefined && revenue !== undefined && revenue !== 0
    ? (netIncome / revenue) * 100
    : undefined
  const roe = netIncome !== undefined && equity !== undefined && equity !== 0
    ? (netIncome / equity) * 100
    : undefined
  const netCash = cash !== undefined && debt !== undefined
    ? cash - debt
    : undefined

  // 현재 기간 정보
  const currentPeriod = latestStatement.period
  const currentFiscalYear = currentPeriod.fiscalYear
  const currentQuarter = currentPeriod.quarter
  const currentPeriodType = currentPeriod.periodType
  const currentEndDate = currentPeriod.endDate

  // 비교 값 찾기 헬퍼 함수
  const findPrevYearStatement = (): BundleFinancialStatement | null => {
    if (!currentFiscalYear || !allStatements || allStatements.length === 0) return null
    const prevYear = currentFiscalYear - 1
    return allStatements.find(s => 
      s?.period?.fiscalYear === prevYear &&
      s?.period?.periodType === currentPeriodType &&
      s?.period?.quarter === currentQuarter
    ) || null
  }

  const findPriorEndStatement = (): BundleFinancialStatement | null => {
    if (!currentEndDate || !allStatements || allStatements.length === 0) return null
    // endDate 기준으로 이전 기간 찾기 (가장 가까운 이전 기간)
    let currentDate: Date
    try {
      currentDate = new Date(currentEndDate)
      if (isNaN(currentDate.getTime())) return null
    } catch {
      return null
    }
    
    let priorStatement: BundleFinancialStatement | null = null
    let priorDate: Date | null = null

    for (const stmt of allStatements) {
      if (!stmt?.period?.endDate) continue
      try {
        const stmtDate = new Date(stmt.period.endDate)
        if (isNaN(stmtDate.getTime())) continue
        if (stmtDate < currentDate && (!priorDate || stmtDate > priorDate)) {
          priorDate = stmtDate
          priorStatement = stmt
        }
      } catch {
        continue
      }
    }

    return priorStatement
  }

  // === QoQ 파생 로직 ===
  // 같은 연도 내 YTD 페어 탐색 (예: 2025-09-30(9M) + 2025-06-30(6M))
  interface SingleQuarterDerived {
    revenue?: number
    operatingIncome?: number
    netIncome?: number
    ocf?: number
    capex?: number
    operatingMargin?: number
    netMargin?: number
    fcf?: number
  }
  
  const findYTDStatements = (): { current?: BundleFinancialStatement; prev?: BundleFinancialStatement } => {
    if (!currentFiscalYear || !currentPeriodType || currentPeriodType !== 'YTD' || !currentEndDate) {
      return {}
    }
    
    // 같은 연도, 같은 periodType(YTD)인 statements 찾기 (endDate 기준 내림차순 정렬되어 있음)
    const ytdStatements = allStatements.filter(s => 
      s?.period?.fiscalYear === currentFiscalYear &&
      s?.period?.periodType === 'YTD' &&
      s?.period?.endDate
    )
    
    if (ytdStatements.length < 2) return {}
    
    // 최신이 current (allStatements[0]가 최신이지만, 같은 연도 YTD 중에서 찾기)
    const currentYTD = ytdStatements[0] // 최신 YTD (9M)
    
    // current와 다른 endDate를 가진 YTD 찾기 (6M, 3M 등)
    // 예: 9M(endDate: 2025-09-30)과 6M(endDate: 2025-06-30)
    let prevYTD: BundleFinancialStatement | undefined
    for (const stmt of ytdStatements) {
      if (stmt.period.endDate && stmt.period.endDate !== currentEndDate) {
        const stmtDate = new Date(stmt.period.endDate)
        const currentDate = new Date(currentEndDate)
        if (stmtDate < currentDate && (!prevYTD || new Date(prevYTD.period.endDate || '').getTime() < stmtDate.getTime())) {
          prevYTD = stmt
        }
      }
    }
    
    return { current: currentYTD, prev: prevYTD }
  }
  
  const deriveSingleQuarter = (
    currentYTD: BundleFinancialStatement,
    prevYTD: BundleFinancialStatement
  ): SingleQuarterDerived | null => {
    try {
      if (!currentYTD || !prevYTD) return null
      
      const currentRevenue = currentYTD.income?.revenue?.value
      const prevRevenue = prevYTD.income?.revenue?.value
      const currentOperatingIncome = currentYTD.income?.operatingIncome?.value
      const prevOperatingIncome = prevYTD.income?.operatingIncome?.value
      const currentNetIncome = currentYTD.income?.netIncome?.value
      const prevNetIncome = prevYTD.income?.netIncome?.value
      const currentOcf = currentYTD.cashflow?.operatingCashFlow?.value
      const prevOcf = prevYTD.cashflow?.operatingCashFlow?.value
      const currentCapex = currentYTD.cashflow?.capitalExpenditure?.value
      const prevCapex = prevYTD.cashflow?.capitalExpenditure?.value
      
      // 모든 필수 값이 있어야 단독분기 파생 가능
      if (currentRevenue === undefined || prevRevenue === undefined ||
          currentOperatingIncome === undefined || prevOperatingIncome === undefined ||
          currentNetIncome === undefined || prevNetIncome === undefined ||
          currentOcf === undefined || prevOcf === undefined ||
          currentCapex === undefined || prevCapex === undefined) {
        return null
      }
      
      // 단독분기 파생: 9M - 6M = Q3 단독
      const singleRevenue = currentRevenue - prevRevenue
      const singleOperatingIncome = currentOperatingIncome - prevOperatingIncome
      const singleNetIncome = currentNetIncome - prevNetIncome
      const singleOcf = currentOcf - prevOcf
      const singleCapex = currentCapex - prevCapex
      
      // 파생값으로 재계산되는 지표 (0으로 나누기 방지)
      const singleOperatingMargin = (singleRevenue !== 0 && !isNaN(singleRevenue) && !isNaN(singleOperatingIncome)) 
        ? (singleOperatingIncome / singleRevenue) * 100 
        : undefined
      const singleNetMargin = (singleRevenue !== 0 && !isNaN(singleRevenue) && !isNaN(singleNetIncome))
        ? (singleNetIncome / singleRevenue) * 100
        : undefined
      const singleFcf = (!isNaN(singleOcf) && !isNaN(singleCapex))
        ? singleOcf - singleCapex
        : undefined
      
      return {
        revenue: singleRevenue,
        operatingIncome: singleOperatingIncome,
        netIncome: singleNetIncome,
        ocf: singleOcf,
        capex: singleCapex,
        operatingMargin: singleOperatingMargin,
        netMargin: singleNetMargin,
        fcf: singleFcf,
      }
    } catch (error) {
      // 에러 발생 시 null 반환 (QoQ 비활성화)
      console.warn('[deriveSingleQuarter] 에러 발생 (QoQ 비활성화):', error)
      return null
    }
  }
  
  const { current: currentYTD, prev: prevYTD } = findYTDStatements()
  const currentSingle = currentYTD && prevYTD ? deriveSingleQuarter(currentYTD, prevYTD) : null
  
  // 직전 단독분기 파생 (예: 6M - 3M = Q2 단독)
  let prevSingle: SingleQuarterDerived | null = null
  if (prevYTD && allStatements.length >= 2) {
    // prevYTD보다 이전 YTD 찾기 (3M)
    const prevYTDDate = prevYTD.period.endDate
    if (prevYTDDate) {
      let prevPrevYTD: BundleFinancialStatement | undefined
      for (const stmt of allStatements) {
        if (stmt.period.fiscalYear === currentFiscalYear &&
            stmt.period.periodType === 'YTD' &&
            stmt.period.endDate &&
            stmt.period.endDate !== prevYTDDate) {
          const stmtDate = new Date(stmt.period.endDate)
          const prevDate = new Date(prevYTDDate)
          if (stmtDate < prevDate && (!prevPrevYTD || new Date(prevPrevYTD.period.endDate || '').getTime() < stmtDate.getTime())) {
            prevPrevYTD = stmt
          }
        }
      }
      
      if (prevPrevYTD && prevYTD) {
        prevSingle = deriveSingleQuarter(prevYTD, prevPrevYTD)
      }
    }
  }

  // 단일 비교 계산 헬퍼 함수
  const calculateCompare = (
    current: number | undefined,
    prev: number | null | undefined,
    compareBasis: 'YOY' | 'VS_PRIOR_END' | 'QOQ' | 'NONE',
    reasonCode?: CompareReasonCode | string
  ): KeyMetricCompare => {
    // compareBasis가 'NONE'인 경우 reasonCode가 반드시 필요
    if (compareBasis === 'NONE') {
      let finalReasonCode: CompareReasonCode
      
      if (reasonCode && isCompareReasonCode(reasonCode)) {
        finalReasonCode = reasonCode
      } else if (reasonCode) {
        // 기존 문자열 reasonCode를 표준 코드로 매핑
        const codeMap: Record<string, CompareReasonCode> = {
          'COMPARE_MISSING_CURRENT': 'MISSING_CURRENT_VALUE',
          'COMPARE_MISSING_PREV': 'MISSING_PREV_YEAR_VALUE',
          'COMPARE_MISSING_PREV_YEAR': 'MISSING_PREV_YEAR_VALUE',
          'COMPARE_MISSING_PRIOR_END': 'MISSING_PRIOR_END_INSTANT',
        }
        finalReasonCode = codeMap[reasonCode] || (current === undefined ? 'MISSING_CURRENT_VALUE' : 'MISSING_PREV_YEAR_VALUE')
      } else {
        // reasonCode가 없으면 기본값 설정
        finalReasonCode = current === undefined ? 'MISSING_CURRENT_VALUE' : 'MISSING_PREV_YEAR_VALUE'
      }
      
      return {
        compareBasis: 'NONE',
        prevValue: null,
        delta: null,
        deltaPct: null,
        trend: 'neutral',
        reasonCode: finalReasonCode,
      }
    }

    // compareBasis가 'NONE'이 아닌 경우에도 값이 없으면 'NONE'으로 변경
    if (current === undefined || prev === null || prev === undefined) {
      let finalReasonCode: CompareReasonCode
      
      if (reasonCode && isCompareReasonCode(reasonCode)) {
        finalReasonCode = reasonCode
      } else {
        finalReasonCode = current === undefined ? 'MISSING_CURRENT_VALUE' : 'MISSING_PREV_YEAR_VALUE'
      }
      
      return {
        compareBasis: 'NONE',
        prevValue: null,
        delta: null,
        deltaPct: null,
        trend: 'neutral',
        reasonCode: finalReasonCode,
      }
    }

    const delta = current - prev
    const deltaPct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : null
    const trend: 'up' | 'down' | 'neutral' = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral'

    return {
      compareBasis,
      prevValue: prev,
      delta,
      deltaPct,
      trend,
      // compareBasis가 'NONE'이 아닌 경우에도 reasonCode가 있으면 포함
      ...(reasonCode && isCompareReasonCode(reasonCode) ? { reasonCode } : {}),
    }
  }

  // 1. revenue (기간형 - YOY 또는 QOQ)
  const prevYearStatement = findPrevYearStatement()
  const revenuePrevYear = prevYearStatement?.income?.revenue?.value ?? 
                          (latestStatement.income?.revenuePrevYear?.value !== undefined ? latestStatement.income.revenuePrevYear.value : undefined)
  
  // QoQ 우선 체크
  if (currentSingle?.revenue !== undefined && prevSingle?.revenue !== undefined) {
    compare.revenue = calculateCompare(
      currentSingle.revenue,
      prevSingle.revenue,
      'QOQ',
      undefined
    )
  } else {
    compare.revenue = calculateCompare(
      revenue,
      revenuePrevYear,
      revenuePrevYear !== undefined ? 'YOY' : 'NONE',
      revenuePrevYear === undefined ? 'MISSING_PREV_YEAR_VALUE' : undefined
    )
  }

  // 2. operatingMargin (기간형 - YOY 또는 QOQ)
  const prevYearOperatingIncome = prevYearStatement?.income?.operatingIncome?.value ?? 
                                  latestStatement.income?.operatingIncomePrevYear?.value ?? undefined
  const prevYearRevenue = prevYearStatement?.income?.revenue?.value ?? 
                          latestStatement.income?.revenuePrevYear?.value ?? undefined
  const prevYearOperatingMargin = prevYearOperatingIncome !== undefined && prevYearRevenue !== undefined && prevYearRevenue !== 0
    ? (prevYearOperatingIncome / prevYearRevenue) * 100
    : undefined
  
  // QoQ 우선 체크
  if (currentSingle?.operatingMargin !== undefined && prevSingle?.operatingMargin !== undefined) {
    compare.operatingMargin = calculateCompare(
      currentSingle.operatingMargin,
      prevSingle.operatingMargin,
      'QOQ',
      undefined
    )
  } else {
    compare.operatingMargin = calculateCompare(
      operatingMargin,
      prevYearOperatingMargin,
      prevYearOperatingMargin !== undefined ? 'YOY' : 'NONE',
      prevYearOperatingMargin === undefined ? 'MISSING_PREV_YEAR_VALUE' : undefined
    )
  }

  // 3. netMargin (기간형 - YOY 또는 QOQ)
  const prevYearNetIncome = prevYearStatement?.income?.netIncome?.value ?? 
                            latestStatement.income?.netIncomePrevYear?.value ?? undefined
  const prevYearNetMargin = prevYearNetIncome !== undefined && prevYearRevenue !== undefined && prevYearRevenue !== 0
    ? (prevYearNetIncome / prevYearRevenue) * 100
    : undefined
  
  // QoQ 우선 체크
  if (currentSingle?.netMargin !== undefined && prevSingle?.netMargin !== undefined) {
    compare.netMargin = calculateCompare(
      currentSingle.netMargin,
      prevSingle.netMargin,
      'QOQ',
      undefined
    )
  } else {
    compare.netMargin = calculateCompare(
      netMargin,
      prevYearNetMargin,
      prevYearNetMargin !== undefined ? 'YOY' : 'NONE',
      prevYearNetMargin === undefined ? 'MISSING_PREV_YEAR_VALUE' : undefined
    )
  }

  // 4. roe (기간형 - YOY)
  const prevYearEquity = prevYearStatement?.balance?.totalEquity?.value ?? undefined
  // ROE는 prevYearNetIncome과 prevYearEquity를 사용 (prevYearStatement가 있으면 그것을 우선, 없으면 latestStatement의 prevYear 필드 사용)
  const prevYearRoe = prevYearNetIncome !== undefined && prevYearEquity !== undefined && prevYearEquity !== 0
    ? (prevYearNetIncome / prevYearEquity) * 100
    : undefined
  compare.roe = calculateCompare(
    roe,
    prevYearRoe,
    prevYearRoe !== undefined ? 'YOY' : 'NONE',
    prevYearRoe === undefined ? 'MISSING_PREV_YEAR_VALUE' : undefined
  )

  // 5. ocf (기간형 - YOY 또는 QOQ)
  const prevYearOcf = prevYearStatement?.cashflow?.operatingCashFlow?.value ?? 
                      latestStatement.cashflow?.ocfPrevYear?.value ?? undefined
  
  // QoQ 우선 체크
  if (currentSingle?.ocf !== undefined && prevSingle?.ocf !== undefined) {
    compare.ocf = calculateCompare(
      currentSingle.ocf,
      prevSingle.ocf,
      'QOQ',
      undefined
    )
  } else {
    compare.ocf = calculateCompare(
      ocf,
      prevYearOcf,
      prevYearOcf !== undefined ? 'YOY' : 'NONE',
      prevYearOcf === undefined ? 'MISSING_PREV_YEAR_VALUE' : undefined
    )
  }

  // 6. capex (기간형 - YOY 또는 QOQ)
  const prevYearCapex = prevYearStatement?.cashflow?.capitalExpenditure?.value ?? 
                        latestStatement.cashflow?.capitalExpenditurePrevYear?.value ?? undefined
  
  // QoQ 우선 체크
  if (currentSingle?.capex !== undefined && prevSingle?.capex !== undefined) {
    compare.capex = calculateCompare(
      currentSingle.capex,
      prevSingle.capex,
      'QOQ',
      undefined
    )
  } else {
    compare.capex = calculateCompare(
      capex,
      prevYearCapex,
      prevYearCapex !== undefined ? 'YOY' : 'NONE',
      prevYearCapex === undefined ? 'MISSING_PREV_YEAR_VALUE' : undefined
    )
  }

  // 7. fcf (기간형 - YOY 또는 QOQ)
  // FCF는 전년동기 OCF/CAPEX가 있으면 재계산 가능
  const prevYearFcfFromStatement = prevYearStatement?.cashflow?.freeCashFlow?.value ?? undefined
  const prevYearOcfForFcf = prevYearStatement?.cashflow?.operatingCashFlow?.value ?? 
                            latestStatement.cashflow?.ocfPrevYear?.value ?? undefined
  const prevYearCapexForFcf = prevYearStatement?.cashflow?.capitalExpenditure?.value ?? 
                             latestStatement.cashflow?.capitalExpenditurePrevYear?.value ?? undefined
  // 전년동기 OCF와 CAPEX가 모두 있으면 FCF 재계산
  const prevYearFcfCalculated = (prevYearOcfForFcf !== undefined && prevYearCapexForFcf !== undefined)
    ? prevYearOcfForFcf - prevYearCapexForFcf
    : undefined
  // prevYearStatement의 FCF가 있으면 우선 사용, 없으면 재계산값 사용
  const prevYearFcf = prevYearFcfFromStatement ?? prevYearFcfCalculated
  
  // QoQ 우선 체크 (FCF는 파생값)
  if (currentSingle?.fcf !== undefined && prevSingle?.fcf !== undefined) {
    compare.fcf = calculateCompare(
      currentSingle.fcf,
      prevSingle.fcf,
      'QOQ',
      undefined
    )
  } else {
    compare.fcf = calculateCompare(
      fcf,
      prevYearFcf,
      prevYearFcf !== undefined ? 'YOY' : 'NONE',
      prevYearFcf === undefined ? 'MISSING_PREV_YEAR_VALUE' : undefined
    )
  }

  // 8. revenueYoY (기간형 - YOY) - revenue와 동일하지만 별도 계산
  compare.revenueYoY = compare.revenue

  // 9. equity (시점형 - VS_PRIOR_END)
  const priorEndStatement = findPriorEndStatement()
  const priorEndEquity = priorEndStatement?.balance?.totalEquity?.value ?? 
                         latestStatement.balance?.equityPriorEnd?.value ?? undefined
  compare.equity = calculateCompare(
    equity,
    priorEndEquity,
    priorEndEquity !== undefined ? 'VS_PRIOR_END' : 'NONE',
    priorEndEquity === undefined ? 'MISSING_PRIOR_END_INSTANT' : undefined
  )

  // 10. cash (시점형 - VS_PRIOR_END)
  const priorEndCash = priorEndStatement?.balance?.cash?.value ?? 
                       latestStatement.balance?.cashPriorEnd?.value ?? undefined
  compare.cash = calculateCompare(
    cash,
    priorEndCash,
    priorEndCash !== undefined ? 'VS_PRIOR_END' : 'NONE',
    priorEndCash === undefined ? 'MISSING_PRIOR_END_INSTANT' : undefined
  )

  // 11. netCash (시점형 - VS_PRIOR_END)
  const priorEndDebt = priorEndStatement?.balance?.interestBearingDebt?.value ?? 
                       latestStatement.balance?.debtPriorEnd?.value ?? undefined
  // netCashPriorEnd는 직접 계산하거나 latestStatement에서 가져오기
  const priorEndNetCashDirect = latestStatement.balance?.netCashPriorEnd?.value ?? undefined
  const priorEndNetCash = priorEndNetCashDirect !== undefined 
    ? priorEndNetCashDirect
    : (priorEndCash !== undefined && priorEndDebt !== undefined
      ? priorEndCash - priorEndDebt
      : undefined)
  // netCash는 값이 증가하면 up (현금 증가/부채 감소 = 좋음)
  const netCashCompare = calculateCompare(
    netCash,
    priorEndNetCash,
    priorEndNetCash !== undefined ? 'VS_PRIOR_END' : 'NONE',
    priorEndNetCash === undefined ? 'MISSING_PRIOR_END_INSTANT' : undefined
  )
    compare.netCash = netCashCompare

  // 12. debtRatio (시점형 - VS_PRIOR_END)
  // D/E(%) = (부채총계 / 자기자본) * 100
  const totalLiabilities = latestStatement.balance?.totalLiabilities?.value ?? undefined
  const totalEquityForDebtRatio = latestStatement.balance?.totalEquity?.value ?? undefined
  const debtRatio = (totalLiabilities !== undefined && totalEquityForDebtRatio !== undefined && totalEquityForDebtRatio !== 0)
    ? (totalLiabilities / totalEquityForDebtRatio) * 100
    : undefined
  
  // priorEnd 부채비율 계산
  // priorEndEquity는 기존 로직을 그대로 사용 (priorEndStatement.balance.totalEquity or latestStatement.balance.equityPriorEnd)
  const priorEndEquityForDebtRatio = priorEndEquity ?? undefined
  
  // priorEndLiabilities는 새로 추가한 필드를 사용
  // priorEndStatement.balance.totalLiabilities.value 우선, 없으면 latestStatement.balance.totalLiabilitiesPriorEnd.value 사용
  const priorEndTotalLiabilities = priorEndStatement?.balance?.totalLiabilities?.value ?? 
                                   latestStatement.balance?.totalLiabilitiesPriorEnd?.value ?? undefined
  const priorEndDebtRatio = (priorEndTotalLiabilities !== undefined && priorEndEquityForDebtRatio !== undefined && priorEndEquityForDebtRatio !== 0)
    ? (priorEndTotalLiabilities / priorEndEquityForDebtRatio) * 100
    : undefined
  
  // 부채총계 또는 자기자본이 없으면 비교불가
  const debtRatioCompare = calculateCompare(
    debtRatio,
    priorEndDebtRatio,
    (priorEndDebtRatio !== undefined && debtRatio !== undefined) ? 'VS_PRIOR_END' : 'NONE',
    (debtRatio === undefined || priorEndDebtRatio === undefined) 
      ? (debtRatio === undefined ? 'MISSING_CURRENT_VALUE' : 'MISSING_PRIOR_END_INSTANT')
      : undefined
  )
  
  // reasonDetail 추가 (디버그용)
  if (debtRatioCompare.compareBasis === 'NONE' && debtRatioCompare.reasonCode === 'MISSING_PRIOR_END_INSTANT') {
    const missingParts: string[] = []
    if (!priorEndTotalLiabilities) missingParts.push('priorEnd liabilities')
    if (!priorEndEquityForDebtRatio) missingParts.push('priorEnd equity')
    if (missingParts.length > 0) {
      debtRatioCompare.reasonDetail = `Missing: ${missingParts.join(', ')}`
    }
  }
  
  compare.debtRatio = debtRatioCompare

    // === 방어 로직: UNAVAILABLE인데 reasonCode가 없는 케이스 검증 ===
    const allMetrics: Array<{ key: string; value: KeyMetricCompare | undefined }> = [
      { key: 'revenue', value: compare.revenue },
      { key: 'operatingMargin', value: compare.operatingMargin },
      { key: 'netMargin', value: compare.netMargin },
      { key: 'roe', value: compare.roe },
      { key: 'ocf', value: compare.ocf },
      { key: 'capex', value: compare.capex },
      { key: 'fcf', value: compare.fcf },
      { key: 'equity', value: compare.equity },
      { key: 'cash', value: compare.cash },
      { key: 'netCash', value: compare.netCash },
      { key: 'revenueYoY', value: compare.revenueYoY },
    ]

    // 검증 및 방어 로직
    const unavailableMetrics: Array<{ key: string; reasonCode: CompareReasonCode | string | undefined }> = []
    
    for (const { key, value } of allMetrics) {
      if (value && value.compareBasis === 'NONE') {
        // reasonCode가 없거나 표준화되지 않은 경우 처리
        if (!value.reasonCode || !isCompareReasonCode(value.reasonCode)) {
          const originalReasonCode = value.reasonCode || 'undefined'
          const errorMsg = `[calculateKeyMetricsCompare] ${key}: compareBasis='NONE'인데 reasonCode가 없거나 표준화되지 않았습니다. reasonCode=${originalReasonCode}`
          
          if (process.env.NODE_ENV !== 'production') {
            // 개발 모드: 에러 로그 출력 및 강제 reasonCode 설정
            console.error(errorMsg)
            value.reasonCode = 'PARSER_ERROR'
            value.reasonDetail = `원본 reasonCode: ${originalReasonCode}`
          } else {
            // 운영 모드: 최소한의 reasonCode 채우기
            value.reasonCode = 'PARSER_ERROR'
            console.warn(errorMsg)
          }
        }
        
        // 검증용: UNAVAILABLE인 카드들의 reasonCode 수집
        unavailableMetrics.push({ key, reasonCode: value.reasonCode })
      }
    }
    
    // 검증 로그 출력 (개발 모드)
    if (process.env.NODE_ENV !== 'production' && unavailableMetrics.length > 0) {
      console.log(`[calculateKeyMetricsCompare] UNAVAILABLE 지표 (총 ${unavailableMetrics.length}개):`)
      unavailableMetrics.forEach(({ key, reasonCode }) => {
        console.log(`  - ${key}: reasonCode=${reasonCode || 'N/A'}`)
      })
    }

    return compare
  } catch (error) {
    // 에러 발생 시 상세 로그 출력 후 빈 객체 반환 (UI 크래시 방지)
    console.error('[calculateKeyMetricsCompare] 에러 발생:', error)
    if (error instanceof Error) {
      console.error('[calculateKeyMetricsCompare] 에러 메시지:', error.message)
      console.error('[calculateKeyMetricsCompare] 에러 스택:', error.stack)
    }
    // 빈 객체 반환으로 UI에서 NONE으로 처리됨
    return {}
  }
}

/**
 * AnalysisBundle 빌드
 */
export function buildAnalysisBundle(
  parseResults: FileParseResult[],
  uploadedFiles: UploadedFile[],
  companyName: string = 'Unknown Company',
  ticker?: string,
  industryClassification?: IndustryClassification // 산업 분류 결과 (선택)
): AnalysisBundle {
  const runId = `run-${Date.now()}-${Math.random().toString(36).substring(7)}`
  const warnings: string[] = []
  const allEvidence: EvidenceRef[] = []

  // === A. statements/derived를 매칭 쌍으로 생성 ===
  type StatementRow = {
    statement: FinancialStatement
    derived: DerivedMetrics
    legacy: LegacyFinancialStatement // XBRL Parser가 확정한 anchor 기간 (단일 진실 소스)
    dataQuality?: {
      missingConcepts: string[]
      blockedMetrics: string[]
    }
  }
  const rows: StatementRow[] = []
  
  // 데이터 품질 정보 수집 (모든 statements에서 누적)
  const allMissingConcepts = new Set<string>()
  const allBlockedMetrics = new Set<string>()

  for (let i = 0; i < parseResults.length; i++) {
    const result = parseResults[i]
    const uploadedFile = uploadedFiles[i]

    if (!result.financialStatement) {
      warnings.push(`파일 ${i + 1}: 재무제표가 없습니다`)
      continue
    }
    const fileId = generateFileId(uploadedFile?.file.name || `file-${i}`, i)
    const xmlContent = result.xmlContent || ''

    // BundleFinancialStatement 변환
    const statement = convertFinancialStatement(
      result.financialStatement,
      fileId,
      xmlContent
    )

    // Evidence 수집
    Object.values(statement.income).forEach(item => {
      if (item.evidence) {
        allEvidence.push(...item.evidence)
      }
    })
    Object.values(statement.cashflow).forEach(item => {
      if (item.evidence) {
        allEvidence.push(...item.evidence)
      }
    })
    Object.values(statement.balance).forEach(item => {
      if (item.evidence) {
        allEvidence.push(...item.evidence)
      }
    })

    // DerivedMetrics 계산 (원본 FinancialStatement 전달하여 기간 정보 활용)
    const derivedResult = calculateDerivedMetrics(statement, result.financialStatement, warnings)

    // 데이터 품질 정보 수집
    derivedResult.missingConcepts.forEach(concept => allMissingConcepts.add(concept))
    derivedResult.blockedMetrics.forEach(metric => allBlockedMetrics.add(metric))

    // 매칭 쌍으로 저장
    rows.push({
      statement,
      derived: derivedResult.metrics,
      legacy: result.financialStatement,
      dataQuality: {
        missingConcepts: derivedResult.missingConcepts,
        blockedMetrics: derivedResult.blockedMetrics,
      }
    })
  }

  // === B. endDate 기준으로 최신순 정렬 (내림차순) ===
  rows.sort((a, b) => {
    const endDateA = a.statement.period.endDate || ''
    const endDateB = b.statement.period.endDate || ''
    // 최신(endDate가 더 큰) 것이 앞에 오도록 내림차순
    return endDateB.localeCompare(endDateA)
  })

  // === C. 대표 row 확정 (rows[0] = 최신 기간) ===
  const representativeRow = rows.length > 0 ? rows[0] : null
  const representativePeriod = representativeRow ? representativeRow.statement.period : null
  const representativeLegacy = representativeRow ? representativeRow.legacy : null

  // === D. bundle.period 및 bundle.periodLabel 설정 ===
  // 단일 PeriodAnchor 생성: bundle.period와 statements[].period가 같은 객체를 참조하도록 보장
  let bundlePeriod: PeriodKey
  let bundlePeriodLabel: string | undefined

  if (representativePeriod) {
    // 단일 PeriodAnchor: 같은 객체 참조 (복사하지 않음)
    bundlePeriod = representativePeriod

    // periodLabel 생성: 대표Legacy의 periodTypeLabel 우선, 없으면 fallback
    if (representativeLegacy?.periodTypeLabel) {
      bundlePeriodLabel = representativeLegacy.periodTypeLabel
    } else {
      // fallback: periodType + quarter 조합
      const periodType = bundlePeriod.periodType
      const quarter = bundlePeriod.quarter

      if (periodType === 'YTD' && quarter) {
        bundlePeriodLabel = `${quarter * 3}M(YTD)`
      } else if (periodType === 'Q' && quarter) {
        bundlePeriodLabel = `Q${quarter}(3M)`
      } else {
        bundlePeriodLabel = periodType === 'FY' ? 'FY' : periodType
      }
    }
  } else {
    // 기본값 (데이터가 없을 때)
    bundlePeriod = {
      periodType: 'FY',
      fiscalYear: new Date().getFullYear(),
    }
    bundlePeriodLabel = 'FY'
  }

  // === E. 방어 로직: 대표Period와 대표Legacy(파서 anchor) 불일치 검사 및 교정 ===
  if (representativePeriod && representativeLegacy) {
    const parserAnchorStartDate = representativeLegacy.startDate
    const parserAnchorEndDate = representativeLegacy.endDate
    const parserAnchorPeriodType = representativeLegacy.periodType
    const parserAnchorPeriodTypeLabel = representativeLegacy.periodTypeLabel
    const parserAnchorFiscalYear = representativeLegacy.fiscalYear
    const parserAnchorQuarter = representativeLegacy.quarter

    let needsCorrection = false
    const correctionReasons: string[] = []

    // 1) periodType 불일치 검사
    if (parserAnchorPeriodType && representativePeriod.periodType !== parserAnchorPeriodType) {
      needsCorrection = true
      correctionReasons.push(`periodType 불일치 bundle=${representativePeriod.periodType}, parser=${parserAnchorPeriodType}`)
    }

    // 2) startDate 불일치 검사
    if (parserAnchorStartDate) {
      if (!representativePeriod.startDate || representativePeriod.startDate !== parserAnchorStartDate) {
        needsCorrection = true
        correctionReasons.push(`startDate 불일치 bundle=${representativePeriod.startDate || '없음'}, parser anchor=${parserAnchorStartDate}`)
      }
    }

    // 3) endDate 불일치 검사
    if (parserAnchorEndDate) {
      if (!representativePeriod.endDate || representativePeriod.endDate !== parserAnchorEndDate) {
        needsCorrection = true
        correctionReasons.push(`endDate 불일치 bundle=${representativePeriod.endDate || '없음'}, parser anchor=${parserAnchorEndDate}`)
      }
    }

    // 4) fiscalYear 불일치 검사
    if (parserAnchorEndDate) {
      const parserFiscalYearFromEndDate = new Date(parserAnchorEndDate).getFullYear()
      if (parserFiscalYearFromEndDate >= 2000 && parserFiscalYearFromEndDate <= 2100) {
        if (!representativePeriod.fiscalYear || representativePeriod.fiscalYear !== parserFiscalYearFromEndDate) {
          needsCorrection = true
          correctionReasons.push(`fiscalYear 불일치 bundle=${representativePeriod.fiscalYear || '없음'}, parser anchor endDate=${parserAnchorEndDate} (연도=${parserFiscalYearFromEndDate})`)
        }
      }
    }

    // 5) quarter 불일치 검사
    if (parserAnchorEndDate) {
      const parserQuarterFromEndDate = (() => {
        const endMonth = new Date(parserAnchorEndDate).getMonth() + 1
        if (endMonth >= 1 && endMonth <= 3) return 1
        if (endMonth >= 4 && endMonth <= 6) return 2
        if (endMonth >= 7 && endMonth <= 9) return 3
        if (endMonth >= 10 && endMonth <= 12) return 4
        return undefined
      })()

      if (parserQuarterFromEndDate) {
        if (!representativePeriod.quarter || representativePeriod.quarter !== parserQuarterFromEndDate) {
          needsCorrection = true
          correctionReasons.push(`quarter 불일치 bundle=${representativePeriod.quarter || '없음'}, parser anchor endDate=${parserAnchorEndDate} (quarter=${parserQuarterFromEndDate})`)
        }
      }
    }

    // 6) YTD/Q인데 startDate가 없는 경우 보정
    if ((representativePeriod.periodType === 'YTD' || representativePeriod.periodType === 'Q') && !representativePeriod.startDate && representativePeriod.endDate) {
      if (parserAnchorStartDate) {
        representativePeriod.startDate = parserAnchorStartDate
        needsCorrection = true
        correctionReasons.push(`startDate 누락 보정: ${representativePeriod.startDate} (XBRL Parser anchor 기간 사용)`)
      } else {
        const endYear = new Date(representativePeriod.endDate).getFullYear()
        if (representativePeriod.periodType === 'YTD') {
          representativePeriod.startDate = `${endYear}-01-01`
          needsCorrection = true
          correctionReasons.push(`startDate 누락 보정: ${representativePeriod.startDate} (YTD 기준, fallback)`)
        }
      }
    }

    // 7) 불일치 감지 시 자동 교정
    if (needsCorrection) {
      const correctionReason = correctionReasons.join('; ')
      console.error(`[AnalysisBundleBuilder] ⚠️ ERROR: 대표기간(rows[0].period)과 XBRL Parser anchor 기간이 불일치합니다!`)
      console.error(`[AnalysisBundleBuilder] 이유: ${correctionReason}`)
      console.error(`[AnalysisBundleBuilder] XBRL Parser anchor 기간 (단일 진실 소스):`, {
        periodType: parserAnchorPeriodType || 'N/A',
        periodTypeLabel: parserAnchorPeriodTypeLabel || 'N/A',
        startDate: parserAnchorStartDate || 'N/A',
        endDate: parserAnchorEndDate || 'N/A',
        fiscalYear: parserAnchorFiscalYear || 'N/A',
        quarter: parserAnchorQuarter || 'N/A'
      })
      console.error(`[AnalysisBundleBuilder] 현재 대표기간 (교정 전):`, {
        periodType: representativePeriod.periodType,
        startDate: representativePeriod.startDate || 'N/A',
        endDate: representativePeriod.endDate || 'N/A',
        quarter: representativePeriod.quarter || 'N/A',
        fiscalYear: representativePeriod.fiscalYear || 'N/A'
      })

      // 자동 교정 (bundlePeriod와 representativePeriod는 같은 객체이므로 한 번만 수정)
      if (parserAnchorPeriodType) {
        representativePeriod.periodType = parserAnchorPeriodType
      }
      if (parserAnchorStartDate) {
        representativePeriod.startDate = parserAnchorStartDate
      }
      if (parserAnchorEndDate) {
        representativePeriod.endDate = parserAnchorEndDate
      }
      if (parserAnchorEndDate) {
        const endYear = new Date(parserAnchorEndDate).getFullYear()
        if (endYear >= 2000 && endYear <= 2100) {
          representativePeriod.fiscalYear = endYear
        }
      }
      if (parserAnchorEndDate) {
        const endMonth = new Date(parserAnchorEndDate).getMonth() + 1
        if (endMonth >= 1 && endMonth <= 3) {
          representativePeriod.quarter = 1
        } else if (endMonth >= 4 && endMonth <= 6) {
          representativePeriod.quarter = 2
        } else if (endMonth >= 7 && endMonth <= 9) {
          representativePeriod.quarter = 3
        } else if (endMonth >= 10 && endMonth <= 12) {
          representativePeriod.quarter = 4
        }
      }

      // periodLabel 재생성
      if (parserAnchorPeriodTypeLabel) {
        bundlePeriodLabel = parserAnchorPeriodTypeLabel
      } else {
        const periodType = bundlePeriod.periodType
        const quarter = bundlePeriod.quarter
        if (periodType === 'YTD' && quarter) {
          bundlePeriodLabel = `${quarter * 3}M(YTD)`
        } else if (periodType === 'Q' && quarter) {
          bundlePeriodLabel = `Q${quarter}(3M)`
        } else {
          bundlePeriodLabel = periodType === 'FY' ? 'FY' : periodType
        }
      }
      console.error(`[AnalysisBundleBuilder] ✅ 자동 교정 완료: XBRL Parser anchor 기간으로 교정되었습니다.`)

      // bundlePeriod와 representativePeriod는 같은 객체이므로 이미 동기화됨
    }
  }

  // === F. 정렬된 rows에서 statements와 derived 재구성 ===
  // 단일 PeriodAnchor: statements[0].period를 bundlePeriod로 직접 참조 설정
  const sortedStatements = rows.map(r => r.statement)
  const sortedDerived = rows.map(r => r.derived)

  // statements[0].period를 bundlePeriod로 직접 참조 설정 (단일 PeriodAnchor)
  if (sortedStatements.length > 0 && bundlePeriod) {
    sortedStatements[0].period = bundlePeriod
  }

  // 중복 제거된 Evidence
  const uniqueEvidence = Array.from(
    new Map(allEvidence.map(e => [JSON.stringify(e), e])).values()
  )

  // 데이터 품질 정보 구성 (최신 statement 기준)
  const latestDataQuality = rows.length > 0 && rows[0].dataQuality ? rows[0].dataQuality : undefined
  const dataQuality: DataQuality | undefined = latestDataQuality || (allMissingConcepts.size > 0 || allBlockedMetrics.size > 0) ? {
    missingConcepts: Array.from(allMissingConcepts),
    blockedMetrics: Array.from(allBlockedMetrics),
  } : undefined

  // 계산 정책 메타데이터 구성 (재현성 강화)
  // EPS 스코프 추론: netIncomeDiscontinued가 있으면 CONTINUING, 없으면 TOTAL
  const epsScope: 'CONTINUING' | 'TOTAL' = (representativeLegacy?.incomeStatement.netIncomeDiscontinued) ? 'CONTINUING' : 'TOTAL'
  // CAPEX 구성 요소 포함 여부
  const hasCapexPPE = representativeLegacy?.cashFlowStatement.capexPPE !== undefined
  const hasCapexIntangible = representativeLegacy?.cashFlowStatement.capexIntangible !== undefined
  const calculationPolicy: CalculationPolicy = {
    capexPolicy: CAPEX_POLICY, // xbrl-parser의 정책 상수 사용
    epsScope, // 추론: netIncomeDiscontinued 존재 여부로 판단
    roeDefinition: 'CUMULATIVE_END_EQUITY', // 현재 ROE 라벨과 동일한 정의 고정
    fcfDefinition: 'OCF_MINUS_CAPEX', // FCF 정의 고정
    capexComponentsIncluded: {
      ppe: hasCapexPPE, // capexPPE가 있으면 true
      intangible: hasCapexIntangible, // capexIntangible이 있으면 true
    },
  }

  // AnalysisBundle 생성 (StepOutputs 제외, period 필드 추가)
  const bundle: AnalysisBundle = {
    runId,
    company: {
      name: companyName,
      ticker,
      market: 'KR', // TODO: 적절 감지
      industry: industryClassification ? {
        label: industryClassification.label,
        confidence: industryClassification.confidence,
        evidence: (industryClassification.evidence || []).map((e) => ({
          source: e.source,
          excerpt: e.excerpt,
          locationHint: e.locationHint,
          topic: e.topic,
          id: e.id,
          title: e.title,
          text: e.text,
          sourceInfo: e.sourceInfo ? {
            page: e.sourceInfo.page,
            section: e.sourceInfo.section,
            heading: e.sourceInfo.heading,
          } : undefined,
        })),
        coreCategories: industryClassification.coreCategories,
        adjacentCategories: industryClassification.adjacentCategories,
        reasonCode: industryClassification.reasonCode,
      } : undefined,
    },
    period: bundlePeriod, // 최상단에 대표 기간
    periodLabel: bundlePeriodLabel, // 기간 라벨
    statements: sortedStatements, // 정렬된 statements
    derived: sortedDerived, // 정렬된 derived (1:1 매칭)
    stepOutputs: [], // 임시 빈 배열
    allEvidence: uniqueEvidence,
    warnings,
    dataQuality, // 데이터 품질 정보 추가
    meta: {
      calculationPolicy, // 계산 정책 메타데이터 추가
    },
  }

  // Step 1~11 실행 (bundle을 기반으로 StepOutputs 생성)
  const stepOutputs = runLevel2Steps(bundle)

  // StepOutputs를 bundle에 추가
  bundle.stepOutputs = stepOutputs

  // === G. 최종 검증 로그 (1회만 출력, 과다 금지) ===
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[AnalysisBundle] period(top-level):`, {
      periodType: bundlePeriod.periodType,
      startDate: bundlePeriod.startDate || 'N/A',
      endDate: bundlePeriod.endDate || 'N/A',
      quarter: bundlePeriod.quarter || 'N/A',
      fiscalYear: bundlePeriod.fiscalYear || 'N/A',
      periodLabel: bundlePeriodLabel || 'N/A'
    })
    if (sortedStatements.length > 0 && sortedStatements[0].period) {
      const firstStatementPeriod = sortedStatements[0].period
      console.log(`[AnalysisBundle] statements[0].period:`, {
        periodType: firstStatementPeriod.periodType,
        startDate: firstStatementPeriod.startDate || 'N/A',
        endDate: firstStatementPeriod.endDate || 'N/A',
        quarter: firstStatementPeriod.quarter || 'N/A',
        fiscalYear: firstStatementPeriod.fiscalYear || 'N/A'
      })

      // 두 값이 동일한지 체크
      const isMatch =
        bundlePeriod.periodType === firstStatementPeriod.periodType &&
        bundlePeriod.startDate === firstStatementPeriod.startDate &&
        bundlePeriod.endDate === firstStatementPeriod.endDate &&
        bundlePeriod.quarter === firstStatementPeriod.quarter &&
        bundlePeriod.fiscalYear === firstStatementPeriod.fiscalYear
      console.log(`[AnalysisBundle] period 일치 검증: bundle.period === statements[0].period? ${isMatch ? '✅ 일치' : '❌ 불일치'}`)
    }
  }

  // === H. keyMetricsCompare 계산 및 할당 ===
  if (sortedStatements.length > 0) {
    const latestStatement = sortedStatements[0]
    const latestDerived = sortedDerived[0] || {} as DerivedMetrics
    try {
      latestStatement.keyMetricsCompare = calculateKeyMetricsCompare(
        latestStatement,
        latestDerived,
        sortedStatements
      )
    } catch (error) {
      console.error('[AnalysisBundleBuilder] keyMetricsCompare 계산 중 에러:', error)
      // 에러 발생 시 빈 객체로 설정 (UI에서 NONE으로 처리됨)
      latestStatement.keyMetricsCompare = {}
    }
  }

  // === I. Self-Check 검증 (bundle 생성 직후) ===
  const selfCheckResult = runSelfCheck(bundle)
  if (selfCheckResult.pass) {
    console.log(`[SelfCheck] PASS: ${selfCheckResult.summary}`)
    if (selfCheckResult.warnings.length > 0) {
      console.log(`[SelfCheck] Warnings:`, selfCheckResult.warnings)
    }
  } else {
    console.error(`[SelfCheck] FAIL: ${selfCheckResult.summary}`)
    console.error(`[SelfCheck] Failures:`, selfCheckResult.failures)
    if (selfCheckResult.warnings.length > 0) {
      console.error(`[SelfCheck] Warnings:`, selfCheckResult.warnings)
    }
  }

  return bundle
}
