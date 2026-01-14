/**
 * 차트 가용성 해결 모듈
 * AnalysisBundle을 기반으로 각 Step별 가능한 차트를 결정
 * 
 * 원칙:
 * - line(추세) 차트는 동일 기준 관측치 2개 이상일 때만
 * - 관측치 1개면 snapshot으로 전환
 * - 기간 성격이 다른 값을 line으로 연결하지 않음
 */

import type { AnalysisBundle, ChartPlan, ChartPlanItem, PeriodKey, BundleFinancialStatement } from '@/types/analysis-bundle'

/**
 * 기간 기준 (Period Criteria)
 * 동일 기준인지 판단하기 위한 정보
 */
interface PeriodCriteria {
  /** 기간 유형 (FY/Q/YTD) */
  periodType: PeriodKey['periodType']
  
  /** 누적 여부 */
  isCumulative: boolean
  
  /** 통화 */
  currency: string
  
  /** 단위 */
  unit: string
}

/**
 * 기간 기준 추출
 */
function extractPeriodCriteria(statement: BundleFinancialStatement): PeriodCriteria {
  const period = statement.period
  
  // 통화/단위는 첫 번째 재무 항목에서 추출 (예시)
  const firstIncomeItem = Object.values(statement.income)[0]
  const currency = firstIncomeItem?.meta?.currency || 'KRW'
  const unit = firstIncomeItem?.meta?.unit || '원'
  
  return {
    periodType: period.periodType,
    isCumulative: period.periodType === 'YTD',
    currency,
    unit,
  }
}

/**
 * 동일 기준인지 확인
 */
function isSameCriteria(a: PeriodCriteria, b: PeriodCriteria): boolean {
  return (
    a.periodType === b.periodType &&
    a.isCumulative === b.isCumulative &&
    a.currency === b.currency &&
    a.unit === b.unit
  )
}

/**
 * Step 03: 실적/기대 차트 계획
 */
function resolveStep03Charts(bundle: AnalysisBundle): ChartPlan {
  const charts: ChartPlanItem[] = []
  const statements = bundle.statements
  
  if (statements.length === 0) {
    charts.push({
      chartId: 'step03-income-snapshot',
      chartType: 'snapshot',
      periodLabel: 'N/A',
      dataKeys: [],
      available: false,
      reason: '재무제표 데이터 없음',
    })
    return { step: 3, charts }
  }
  
  // 기간 기준별로 그룹화
  const criteriaGroups = new Map<string, BundleFinancialStatement[]>()
  statements.forEach(stmt => {
    const criteria = extractPeriodCriteria(stmt)
    const key = JSON.stringify(criteria)
    if (!criteriaGroups.has(key)) {
      criteriaGroups.set(key, [])
    }
    criteriaGroups.get(key)!.push(stmt)
  })
  
  // 각 기준별로 차트 생성
  criteriaGroups.forEach((groupStatements, criteriaKey) => {
    const criteria = JSON.parse(criteriaKey) as PeriodCriteria
    const latestStatement = groupStatements[0] // 최신순 정렬 가정
    
    // 가능한 데이터 키 확인
    const availableKeys: string[] = []
    if (latestStatement.income?.revenue?.value !== undefined) availableKeys.push('revenue')
    if (latestStatement.income?.operatingIncome?.value !== undefined) availableKeys.push('operatingIncome')
    if (latestStatement.income?.netIncome?.value !== undefined) availableKeys.push('netIncome')
    
    if (availableKeys.length === 0) {
      charts.push({
        chartId: `step03-income-${criteriaKey}`,
        chartType: 'snapshot',
        periodLabel: `${criteria.periodType}`,
        dataKeys: [],
        available: false,
        reason: '손익계산서 데이터 부족',
      })
      return
    }
    
    // 동일 기준 관측치 2개 이상이면 line, 1개면 snapshot
    if (groupStatements.length >= 2) {
      // Line 차트 (추세)
      charts.push({
        chartId: `step03-income-trend-${criteriaKey}`,
        chartType: 'line',
        periodLabel: `${criteria.periodType} 추세`,
        dataKeys: availableKeys,
        available: true,
      })
    } else {
      // Snapshot 차트 (단일 기간)
      charts.push({
        chartId: `step03-income-snapshot-${criteriaKey}`,
        chartType: 'snapshot',
        periodLabel: `${criteria.periodType} 스냅샷`,
        dataKeys: availableKeys,
        available: true,
      })
      
      // YoY 비교 가능 여부 확인 (전년동기 비교치)
      const year = latestStatement.period.fiscalYear
      if (year) {
        const previousYearStatement = statements.find(s => 
          s.period.fiscalYear === year - 1 && 
          s.period.periodType === criteria.periodType &&
          s.period.quarter === latestStatement.period.quarter
        )
        
        if (previousYearStatement) {
          charts.push({
            chartId: `step03-income-yoy-${criteriaKey}`,
            chartType: 'bar',
            periodLabel: 'YoY 비교',
            dataKeys: availableKeys,
            available: true,
          })
        } else {
          charts.push({
            chartId: `step03-income-yoy-${criteriaKey}`,
            chartType: 'bar',
            periodLabel: 'YoY 비교',
            dataKeys: availableKeys,
            available: false,
            reason: '전년동기 데이터 없음',
            requiredReports: `전년 ${criteria.periodType === 'Q' ? '동기 분기' : '연간'} 보고서 1개`,
          })
        }
      }
    }
  })
  
  // YTD만 있고 직전 누적이 없으면 배지 추가
  const ytdStatements = statements.filter(s => s.period.periodType === 'YTD')
  if (ytdStatements.length > 0 && statements.filter(s => s.period.periodType === 'Q').length === 0) {
    charts.forEach(chart => {
      if (chart.periodLabel.includes('YTD')) {
        chart.badge = '분기 분해 불가'
      }
    })
  }
  
  return { step: 3, charts }
}

/**
 * Step 05: 현금흐름 차트 계획
 */
function resolveStep05Charts(bundle: AnalysisBundle): ChartPlan {
  const charts: ChartPlanItem[] = []
  const statements = bundle.statements
  
  if (statements.length === 0) {
    charts.push({
      chartId: 'step05-cashflow-waterfall',
      chartType: 'waterfall',
      periodLabel: 'N/A',
      dataKeys: [],
      available: false,
      reason: '재무제표 데이터 없음',
    })
    return { step: 5, charts }
  }
  
  const latestStatement = statements[0]
  
  // 가능한 데이터 키 확인
  const availableKeys: string[] = []
  if (latestStatement.cashflow?.operatingCashFlow?.value !== undefined) availableKeys.push('operatingCashFlow')
  if (latestStatement.cashflow?.capitalExpenditure?.value !== undefined) availableKeys.push('capitalExpenditure')
  if (latestStatement.cashflow?.freeCashFlow?.value !== undefined) availableKeys.push('freeCashFlow')
  
  if (availableKeys.length === 0) {
    charts.push({
      chartId: 'step05-cashflow-waterfall',
      chartType: 'waterfall',
      periodLabel: 'N/A',
      dataKeys: [],
      available: false,
      reason: '현금흐름표 데이터 부족',
    })
    return { step: 5, charts }
  }
  
  // Waterfall 차트 (단일 기간 스냅샷)
  charts.push({
    chartId: 'step05-cashflow-waterfall',
    chartType: 'waterfall',
    periodLabel: '현금흐름 구조',
    dataKeys: availableKeys,
    available: true,
  })
  
  // 기간 기준별로 그룹화하여 추세 확인
  const criteriaGroups = new Map<string, BundleFinancialStatement[]>()
  statements.forEach(stmt => {
    const criteria = extractPeriodCriteria(stmt)
    const key = JSON.stringify(criteria)
    if (!criteriaGroups.has(key)) {
      criteriaGroups.set(key, [])
    }
    criteriaGroups.get(key)!.push(stmt)
  })
  
  // 동일 기준 관측치 2개 이상이면 line 차트 추가
  criteriaGroups.forEach((groupStatements, criteriaKey) => {
    if (groupStatements.length >= 2) {
      const criteria = JSON.parse(criteriaKey) as PeriodCriteria
      charts.push({
        chartId: `step05-cashflow-trend-${criteriaKey}`,
        chartType: 'line',
        periodLabel: `${criteria.periodType} 추세`,
        dataKeys: availableKeys,
        available: true,
      })
    }
  })
  
  return { step: 5, charts }
}

/**
 * Step 06: 재무안정 차트 계획
 */
function resolveStep06Charts(bundle: AnalysisBundle): ChartPlan {
  const charts: ChartPlanItem[] = []
  const statements = bundle.statements
  
  if (statements.length === 0) {
    charts.push({
      chartId: 'step06-balance-snapshot',
      chartType: 'snapshot',
      periodLabel: 'N/A',
      dataKeys: [],
      available: false,
      reason: '재무제표 데이터 없음',
    })
    return { step: 6, charts }
  }
  
  const latestStatement = statements[0]
  
  // 가능한 데이터 키 확인
  const availableKeys: string[] = []
  if (latestStatement.balance?.totalAssets?.value !== undefined) availableKeys.push('totalAssets')
  if (latestStatement.balance?.totalLiabilities?.value !== undefined) availableKeys.push('totalLiabilities')
  if (latestStatement.balance?.totalEquity?.value !== undefined) availableKeys.push('totalEquity')
  
  if (availableKeys.length === 0) {
    charts.push({
      chartId: 'step06-balance-snapshot',
      chartType: 'snapshot',
      periodLabel: 'N/A',
      dataKeys: [],
      available: false,
      reason: '재무상태표 데이터 부족',
    })
    return { step: 6, charts }
  }
  
  // 기간 기준별로 그룹화
  const criteriaGroups = new Map<string, BundleFinancialStatement[]>()
  statements.forEach(stmt => {
    const criteria = extractPeriodCriteria(stmt)
    const key = JSON.stringify(criteria)
    if (!criteriaGroups.has(key)) {
      criteriaGroups.set(key, [])
    }
    criteriaGroups.get(key)!.push(stmt)
  })
  
  // 동일 기준 관측치 2개 이상이면 line, 1개면 snapshot
  criteriaGroups.forEach((groupStatements, criteriaKey) => {
    const criteria = JSON.parse(criteriaKey) as PeriodCriteria
    
    if (groupStatements.length >= 2) {
      charts.push({
        chartId: `step06-balance-trend-${criteriaKey}`,
        chartType: 'line',
        periodLabel: `${criteria.periodType} 추세`,
        dataKeys: availableKeys,
        available: true,
      })
    } else {
      charts.push({
        chartId: `step06-balance-snapshot-${criteriaKey}`,
        chartType: 'snapshot',
        periodLabel: `${criteria.periodType} 스냅샷`,
        dataKeys: availableKeys,
        available: true,
      })
    }
  })
  
  return { step: 6, charts }
}

/**
 * Step 04: 수익성 지표 차트 계획 (마진 게이지)
 */
function resolveStep04Charts(bundle: AnalysisBundle): ChartPlan {
  const charts: ChartPlanItem[] = []
  const statements = bundle.statements
  
  if (statements.length === 0) {
    charts.push({
      chartId: 'step04-margin-gauge',
      chartType: 'gauge',
      periodLabel: 'N/A',
      dataKeys: [],
      available: false,
      reason: '재무제표 데이터 없음',
    })
    return { step: 4, charts }
  }
  
  const latestStatement = statements[0]
  const derivedMetrics = bundle.derived[0]
  
  // 가능한 데이터 키 확인
  const availableKeys: string[] = []
  if (derivedMetrics?.opm !== undefined) availableKeys.push('opm')
  if (derivedMetrics?.fcfMargin !== undefined) availableKeys.push('fcfMargin')
  
  if (availableKeys.length === 0) {
    charts.push({
      chartId: 'step04-margin-gauge',
      chartType: 'gauge',
      periodLabel: 'N/A',
      dataKeys: [],
      available: false,
      reason: '마진 지표 계산 불가',
    })
    return { step: 4, charts }
  }
  
  // Gauge 차트 (단일 기간 스냅샷)
  charts.push({
    chartId: 'step04-margin-gauge',
    chartType: 'gauge',
    periodLabel: '마진 지표',
    dataKeys: availableKeys,
    available: true,
  })
  
  return { step: 4, charts }
}

/**
 * 차트 가용성 해결
 * AnalysisBundle을 기반으로 각 Step별 가능한 차트를 결정
 */
export function resolveChartAvailability(bundle: AnalysisBundle): ChartPlan[] {
  const chartPlans: ChartPlan[] = []
  
  // Step 03: 실적/기대
  chartPlans.push(resolveStep03Charts(bundle))
  
  // Step 04: 수익성 지표
  chartPlans.push(resolveStep04Charts(bundle))
  
  // Step 05: 현금흐름
  chartPlans.push(resolveStep05Charts(bundle))
  
  // Step 06: 재무안정
  chartPlans.push(resolveStep06Charts(bundle))
  
  return chartPlans
}
