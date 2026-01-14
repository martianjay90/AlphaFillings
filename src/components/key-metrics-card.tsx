"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { FinancialStatement } from '@/types/financial'
import type { AnalysisBundle } from '@/types/analysis-bundle'
import { cn } from '@/lib/utils/cn'
import { formatKRWAmount } from '@/lib/utils/unit-converter'
import { useMemo } from 'react'
import { formatCompareReasonKOR, isCompareReasonCode } from '@/lib/compare/reasonCodes'
import type { CompareReasonCode } from '@/lib/compare/reasonCodes'
import { PolicyHelp } from '@/components/policy-help'

interface KeyMetricsCardProps {
  financialStatement: FinancialStatement
  analysisBundle?: AnalysisBundle | null
  className?: string
}

/**
 * 핵심 지표 요약 카드 (1개 파일일 경우)
 * 11개 카드를 항상 표시하고, 값이 없으면 원인을 표시합니다.
 */
export function KeyMetricsCard({ financialStatement, analysisBundle, className }: KeyMetricsCardProps) {
  // AnalysisBundle statements[0] 우선 사용 (단일 진실 소스)
  // statements[0]가 최신 데이터 (period.endDate 기준으로 이미 정렬되어 있음)
  const latestStatement = analysisBundle?.statements?.[0]
  
  // KPI 값 추출: analysisBundle 우선, 없으면 financialStatement fallback
  const revenue = latestStatement?.income?.revenue?.value ?? financialStatement.incomeStatement.revenue.value
  const operatingIncome = latestStatement?.income?.operatingIncome?.value ?? financialStatement.incomeStatement.operatingIncome.value
  const netIncome = latestStatement?.income?.netIncome?.value ?? financialStatement.incomeStatement.netIncome.value
  const totalEquity = latestStatement?.balance?.totalEquity?.value ?? financialStatement.balanceSheet.totalEquity.value
  const operatingCashFlow = latestStatement?.cashflow?.operatingCashFlow?.value ?? financialStatement.cashFlowStatement.operatingCashFlow.value
  const capexValue = latestStatement?.cashflow?.capitalExpenditure?.value
  const fcfValue = latestStatement?.cashflow?.freeCashFlow?.value
  
  // 추가 지표 값 추출
  const cash = latestStatement?.balance?.cash?.value ?? financialStatement.balanceSheet.cash?.value
  const debt = latestStatement?.balance?.interestBearingDebt?.value ?? financialStatement.balanceSheet.interestBearingDebt?.value
  const revenuePrevYear = latestStatement?.income?.revenuePrevYear?.value ?? financialStatement.incomeStatement.revenuePrevYear?.value
  const totalLiabilities = latestStatement?.balance?.totalLiabilities?.value ?? financialStatement.balanceSheet.totalLiabilities.value

  // 핵심 지표 계산 (비율 계산 가드: 분모가 0/null/비정상적으로 작으면 계산 금지)
  const isValidRevenue = revenue > 0 && revenue >= 1_000_000 // 최소 100만원 이상
  const isValidEquity = totalEquity > 0 && totalEquity >= 1_000_000 // 최소 100만원 이상
  
  const operatingMargin = isValidRevenue ? (operatingIncome / revenue) * 100 : null
  const netMargin = isValidRevenue ? (netIncome / revenue) * 100 : null
  const roe = isValidEquity ? (netIncome / totalEquity) * 100 : null
  const ocfMargin = isValidRevenue ? (operatingCashFlow / revenue) * 100 : null
  // 부채비율(D/E) = (부채총계 / 자기자본) * 100
  const debtRatio = (totalLiabilities !== undefined && totalEquity !== undefined && totalEquity !== 0)
    ? (totalLiabilities / totalEquity) * 100
    : null
  
  // 추가 지표 계산
  // 순차입금/순현금 = (이자발생부채 - 현금)
  const netDebt = (cash !== undefined && cash !== null && debt !== undefined && debt !== null)
    ? debt - cash
    : null
  const netDebtLabel = netDebt !== null
    ? (netDebt >= 0 ? '순차입금' : '순현금')
    : '순차입금/순현금'
  const netDebtDisplayValue = netDebt !== null
    ? (netDebt >= 0 ? netDebt : Math.abs(netDebt))
    : null
  
  // 매출 성장률(YoY) = (당기 매출 - 전기동기 매출) / 전기동기 매출 * 100
  const revenueYoY = (revenuePrevYear !== undefined && revenuePrevYear !== null && revenuePrevYear > 0)
    ? ((revenue - revenuePrevYear) / revenuePrevYear) * 100
    : null

  // dataQuality 정보 추출
  const dataQuality = analysisBundle?.dataQuality
  const missingConcepts = dataQuality?.missingConcepts || []
  const warnings = analysisBundle?.warnings || []

  // reasonCode를 한글 문구로 변환 (표준화된 함수만 사용)
  const getReasonForMetric = (
    reasonCode?: CompareReasonCode | string,
    ctx?: { metricLabel?: string; anchorDate?: string }
  ): string | undefined => {
    // reasonCode가 없으면 undefined 반환 (임의 문구 생성 금지)
    if (!reasonCode) {
      return undefined
    }

    // 표준화된 reasonCode인 경우 formatCompareReasonKOR 사용
    if (isCompareReasonCode(reasonCode)) {
      return formatCompareReasonKOR(reasonCode, ctx)
    }

    // 기존 문자열 reasonCode를 표준 코드로 매핑 시도
    const codeMap: Record<string, CompareReasonCode> = {
      'COMPARE_MISSING_PREV_YEAR': 'MISSING_PREV_YEAR_VALUE',
      'COMPARE_MISSING_PRIOR_END': 'MISSING_PRIOR_END_INSTANT',
      'COMPARE_MISSING_CURRENT': 'MISSING_CURRENT_VALUE',
      'COMPARE_MISSING_PREV': 'MISSING_PREV_YEAR_VALUE',
    }
    
    const mappedCode = codeMap[reasonCode]
    if (mappedCode) {
      return formatCompareReasonKOR(mappedCode, ctx)
    }

    // 매핑 실패 시에도 임의 문구 생성 금지 (테스트가 막아야 함)
    return undefined
  }

  type MetricItem = {
    label: string
    value: number | null
    unit: string
    format: (val: number) => string
    trend: 'up' | 'down' | 'neutral'
    status: 'ok' | 'missing' | 'error'
    reason?: string
    compareBasis?: 'YOY' | 'VS_PRIOR_END' | 'QOQ' | 'NONE'
  }

  // 비교 기준 배지 텍스트 매핑
  const getCompareBasisLabel = (basis?: 'YOY' | 'VS_PRIOR_END' | 'QOQ' | 'NONE'): string => {
    switch (basis) {
      case 'YOY':
        return 'YoY'
      case 'VS_PRIOR_END':
        return 'vs 전기말'
      case 'QOQ':
        return 'QoQ'
      case 'NONE':
        return '비교불가'
      default:
        return '비교불가'
    }
  }

  // 값이 없거나 compareBasis가 'NONE'인지 확인
  const isUnavailable = (value: number | null | undefined, compareBasis?: 'YOY' | 'VS_PRIOR_END' | 'QOQ' | 'NONE'): boolean => {
    return (value === null || value === undefined) || compareBasis === 'NONE'
  }

  // EPS 스코프 정책에 따라 순이익률 라벨 결정
  const epsScope = analysisBundle?.meta?.calculationPolicy?.epsScope

  // keyMetricsCompare 추출 (bundle에서 계산된 비교 정보)
  const keyMetricsCompare = latestStatement?.keyMetricsCompare

  // 순이익률 라벨 결정 (EPS 스코프에 따라)
  const netMarginDisplayLabel = epsScope === 'TOTAL' 
    ? '순이익률(총계, NPM)' 
    : '순이익률(계속, NPM)'

  // 순현금/순차입금 라벨 결정
  const netCashDisplayLabel = netDebtLabel === '순현금' 
    ? '순현금(Net Cash)' 
    : netDebtLabel === '순차입금'
    ? '순차입금(Net Debt)'
    : '순현금/순차입금'

  const metrics: MetricItem[] = useMemo(() => {
    // 표시 순서: 매출 → 수익성 → 현금흐름 → 재무상태 퍼널
    const items: MetricItem[] = [
      // 1) 매출액(Revenue)
      {
        label: '매출액(Revenue)',
        value: revenue,
        unit: '원',
        format: (val: number) => formatKRWAmount(val),
        trend: keyMetricsCompare?.revenue?.trend ?? 'neutral',
        status: revenue !== null && revenue !== undefined ? 'ok' : 'missing',
        reason: isUnavailable(revenue, keyMetricsCompare?.revenue?.compareBasis)
          ? getReasonForMetric(keyMetricsCompare?.revenue?.reasonCode, { metricLabel: '매출액(Revenue)' })
          : undefined,
        compareBasis: keyMetricsCompare?.revenue?.compareBasis ?? 'NONE',
      },
      // 2) 매출 성장률(YoY)
      {
        label: '매출 성장률(YoY)',
        value: revenueYoY,
        unit: '%',
        format: (val: number) => `${val.toFixed(1)}%`,
        trend: keyMetricsCompare?.revenueYoY?.trend ?? 'neutral',
        status: revenueYoY !== null ? 'ok' : 'missing',
        reason: isUnavailable(revenueYoY, keyMetricsCompare?.revenueYoY?.compareBasis)
          ? getReasonForMetric(keyMetricsCompare?.revenueYoY?.reasonCode, { metricLabel: '매출 성장률(YoY)' })
          : undefined,
        compareBasis: keyMetricsCompare?.revenueYoY?.compareBasis ?? 'NONE',
      },
      // 3) 영업이익률(OPM)
      {
        label: '영업이익률(OPM)',
        value: operatingMargin,
        unit: '%',
        format: (val: number) => `${val.toFixed(1)}%`,
        trend: keyMetricsCompare?.operatingMargin?.trend ?? 'neutral',
        status: operatingMargin !== null ? 'ok' : 'missing',
        reason: isUnavailable(operatingMargin, keyMetricsCompare?.operatingMargin?.compareBasis)
          ? getReasonForMetric(keyMetricsCompare?.operatingMargin?.reasonCode, { metricLabel: '영업이익률(OPM)' })
          : undefined,
        compareBasis: keyMetricsCompare?.operatingMargin?.compareBasis ?? 'NONE',
      },
      // 4) 순이익률(계속, NPM) 또는 순이익률(총계, NPM)
      {
        label: netMarginDisplayLabel,
        value: netMargin,
        unit: '%',
        format: (val: number) => `${val.toFixed(1)}%`,
        trend: keyMetricsCompare?.netMargin?.trend ?? 'neutral',
        status: netMargin !== null ? 'ok' : 'missing',
        reason: isUnavailable(netMargin, keyMetricsCompare?.netMargin?.compareBasis)
          ? getReasonForMetric(keyMetricsCompare?.netMargin?.reasonCode, { metricLabel: netMarginDisplayLabel })
          : undefined,
        compareBasis: keyMetricsCompare?.netMargin?.compareBasis ?? 'NONE',
      },
      // 5) 영업활동현금흐름(OCF)
      {
        label: '영업활동현금흐름(OCF)',
        value: operatingCashFlow,
        unit: '원',
        format: (val: number) => formatKRWAmount(val),
        trend: keyMetricsCompare?.ocf?.trend ?? 'neutral',
        status: operatingCashFlow !== null && operatingCashFlow !== undefined ? 'ok' : 'missing',
        reason: isUnavailable(operatingCashFlow, keyMetricsCompare?.ocf?.compareBasis)
          ? getReasonForMetric(keyMetricsCompare?.ocf?.reasonCode, { metricLabel: '영업활동현금흐름(OCF)' })
          : undefined,
        compareBasis: keyMetricsCompare?.ocf?.compareBasis ?? 'NONE',
      },
      // 6) 설비투자(CAPEX)
      {
        label: '설비투자(CAPEX)',
        value: capexValue ?? null,
        unit: '원',
        format: (val: number) => formatKRWAmount(val),
        trend: keyMetricsCompare?.capex?.trend ?? 'neutral',
        status: capexValue !== null && capexValue !== undefined ? 'ok' : 'missing',
        reason: isUnavailable(capexValue, keyMetricsCompare?.capex?.compareBasis)
          ? getReasonForMetric(keyMetricsCompare?.capex?.reasonCode, { metricLabel: '설비투자(CAPEX)' })
          : undefined,
        compareBasis: keyMetricsCompare?.capex?.compareBasis ?? 'NONE',
      },
      // 7) 잉여현금흐름(FCF)
      {
        label: '잉여현금흐름(FCF)',
        value: fcfValue ?? null,
        unit: '원',
        format: (val: number) => formatKRWAmount(val),
        trend: keyMetricsCompare?.fcf?.trend ?? 'neutral',
        status: fcfValue !== null && fcfValue !== undefined ? 'ok' : 'missing',
        reason: isUnavailable(fcfValue, keyMetricsCompare?.fcf?.compareBasis)
          ? getReasonForMetric(keyMetricsCompare?.fcf?.reasonCode, { metricLabel: '잉여현금흐름(FCF)' })
          : undefined,
        compareBasis: keyMetricsCompare?.fcf?.compareBasis ?? 'NONE',
      },
      // 8) 현금및현금성자산(Cash)
      {
        label: '현금및현금성자산(Cash)',
        value: cash ?? null,
        unit: '원',
        format: (val: number) => formatKRWAmount(val),
        trend: keyMetricsCompare?.cash?.trend ?? 'neutral',
        status: cash !== null && cash !== undefined ? 'ok' : 'missing',
        reason: isUnavailable(cash, keyMetricsCompare?.cash?.compareBasis)
          ? getReasonForMetric(keyMetricsCompare?.cash?.reasonCode, { metricLabel: '현금및현금성자산(Cash)' })
          : undefined,
        compareBasis: keyMetricsCompare?.cash?.compareBasis ?? 'NONE',
      },
      // 9) 순현금(Net Cash) 또는 순차입금(Net Debt)
      {
        label: netCashDisplayLabel,
        value: netDebtDisplayValue,
        unit: '원',
        format: (val: number) => formatKRWAmount(val),
        trend: keyMetricsCompare?.netCash?.trend ?? 'neutral',
        status: netDebtDisplayValue !== null ? 'ok' : 'missing',
        reason: isUnavailable(netDebtDisplayValue, keyMetricsCompare?.netCash?.compareBasis)
          ? getReasonForMetric(keyMetricsCompare?.netCash?.reasonCode, { metricLabel: netCashDisplayLabel })
          : undefined,
        compareBasis: keyMetricsCompare?.netCash?.compareBasis ?? 'NONE',
      },
      // 10) 부채비율(D/E)
      {
        label: '부채비율(D/E)',
        value: debtRatio,
        unit: '%',
        format: (val: number) => `${val.toFixed(1)}%`,
        trend: keyMetricsCompare?.debtRatio?.trend ?? 'neutral',
        status: debtRatio !== null ? 'ok' : 'missing',
        reason: isUnavailable(debtRatio, keyMetricsCompare?.debtRatio?.compareBasis)
          ? getReasonForMetric(keyMetricsCompare?.debtRatio?.reasonCode, { metricLabel: '부채비율(D/E)' })
          : undefined,
        compareBasis: keyMetricsCompare?.debtRatio?.compareBasis ?? 'NONE',
      },
      // 11) 자기자본(Equity)
      {
        label: '자기자본(Equity)',
        value: totalEquity,
        unit: '원',
        format: (val: number) => formatKRWAmount(val),
        trend: keyMetricsCompare?.equity?.trend ?? 'neutral',
        status: totalEquity !== null && totalEquity !== undefined ? 'ok' : 'missing',
        reason: isUnavailable(totalEquity, keyMetricsCompare?.equity?.compareBasis)
          ? getReasonForMetric(keyMetricsCompare?.equity?.reasonCode, { metricLabel: '자기자본(Equity)' })
          : undefined,
        compareBasis: keyMetricsCompare?.equity?.compareBasis ?? 'NONE',
      },
      // 12) 자기자본이익률(ROE)
      {
        label: '자기자본이익률(ROE)',
        value: roe,
        unit: '%',
        format: (val: number) => `${val.toFixed(1)}%`,
        trend: keyMetricsCompare?.roe?.trend ?? 'neutral',
        status: roe !== null ? 'ok' : 'missing',
        reason: isUnavailable(roe, keyMetricsCompare?.roe?.compareBasis)
          ? getReasonForMetric(keyMetricsCompare?.roe?.reasonCode, { metricLabel: '자기자본이익률(ROE)' })
          : undefined,
        compareBasis: keyMetricsCompare?.roe?.compareBasis ?? 'NONE',
      },
    ]

    return items
  }, [
    revenue,
    operatingMargin,
    netMargin,
    roe,
    operatingCashFlow,
    totalEquity,
    capexValue,
    fcfValue,
    cash,
    netDebtLabel,
    netDebtDisplayValue,
    revenueYoY,
    ocfMargin,
    missingConcepts,
    warnings,
    epsScope,
    netDebtLabel,
    totalLiabilities,
    debtRatio,
    keyMetricsCompare,
  ])

  // 계산 정책 메타데이터 (최소 표시: 정의 라벨만)
  const policy = analysisBundle?.meta?.calculationPolicy

  // 정책 설명 문구 정의 (한 곳에서만 관리)
  const policyHelpContent = useMemo(() => {
    if (!policy) return []
    
    const items: Array<{ title: string; lines: string[] }> = []
    
    // CAPEX 정책 설명
    if (policy.capexPolicy === 'PPE_ONLY') {
      items.push({
        title: `CAPEX: ${policy.capexPolicy}`,
        lines: [
          'CAPEX는 유형자산(PPE) 투자만 포함합니다.',
          '무형자산(소프트웨어/특허 등) 투자는 별도로 봅니다.',
          'FCF = OCF - CAPEX(PPE) 기준입니다.',
        ],
      })
    }
    
    // EPS 정책 설명
    if (policy.epsScope === 'CONTINUING') {
      items.push({
        title: `EPS: ${policy.epsScope}`,
        lines: [
          'EPS/순이익은 계속영업 기준을 우선 사용합니다.',
          '중단사업·일회성 손익은 별도 단계에서 해석합니다.',
        ],
      })
    } else if (policy.epsScope === 'TOTAL') {
      items.push({
        title: `EPS: ${policy.epsScope}`,
        lines: [
          'EPS/순이익은 총계(계속영업+중단영업) 기준을 사용합니다.',
          '일회성 손익도 포함하여 해석합니다.',
        ],
      })
    }
    
    // ROE 정책 설명
    items.push({
      title: 'ROE: 누적/기말',
      lines: [
        'ROE는 누적 이익(YTD)과 기말 자기자본을 기준으로 표시됩니다.',
        '비교(전년동기)가 불가하면 비교불가 + 사유로 표시합니다.',
      ],
    })
    
    return items
  }, [policy])

  return (
    <div className={cn("space-y-4", className)}>
      <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4")}>
        {metrics.map((metric, index) => (
          <Card key={index} className="glass-dark border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl font-bold">
                  {metric.value !== null && metric.value !== undefined 
                    ? metric.format(metric.value) 
                    : 'N/A'}
                </span>
                {/* 아이콘과 배지 */}
                <div className="flex items-center gap-1.5">
                  {/* 비교 기준 배지 */}
                  {metric.compareBasis && (
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded font-medium",
                      metric.compareBasis === 'NONE' 
                        ? "bg-gray-500/10 text-gray-500" 
                        : "bg-blue-500/10 text-blue-500"
                    )}>
                      {getCompareBasisLabel(metric.compareBasis)}
                    </span>
                  )}
                  {/* 아이콘 항상 표시 */}
                  <div className={cn(
                    "p-1 rounded",
                    metric.trend === 'up' && "bg-green-500/10 text-green-500",
                    metric.trend === 'down' && "bg-red-500/10 text-red-500",
                    metric.trend === 'neutral' && "bg-yellow-500/10 text-yellow-500"
                  )}>
                    {metric.trend === 'up' && <TrendingUp className="h-4 w-4" />}
                    {metric.trend === 'down' && <TrendingDown className="h-4 w-4" />}
                    {metric.trend === 'neutral' && <Minus className="h-4 w-4" />}
                  </div>
                </div>
              </div>
              {/* 원인 표시 */}
              {metric.reason && (
                <p className="text-xs text-muted-foreground mt-1">
                  {metric.reason}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {policy && policyHelpContent.length > 0 && (
        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
          {policyHelpContent.map((item, index) => (
            <span key={index} className="inline-flex items-center">
              <span>{item.title}</span>
              <PolicyHelp title={item.title} lines={item.lines} />
              {index < policyHelpContent.length - 1 && (
                <span className="mx-1">|</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
