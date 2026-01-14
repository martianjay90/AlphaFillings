/**
 * Step 03: 실적/기대
 * 매출/영업이익/마진/컨센서스(가능하면) + 시계열 차트 보고
 */

import type { AnalysisBundle, StepOutput, EvidenceRef } from '@/types/analysis-bundle'
import { createFinding, createCheckpoint } from '@/lib/analysis/evidence/assert-evidence'
import { STEP_TITLES } from '@/ui/labels/analysisSteps.ko'
import { formatKRWAmount } from '@/lib/utils/unit-converter'

export function runStep03(bundle: AnalysisBundle): StepOutput {
  const findings: StepOutput['findings'] = []
  const checkpoints: StepOutput['checkpoints'] = []
  const summaryCards: StepOutput['summaryCards'] = []

  // 최신 재무제표에서 EvidenceRef 추출
  const latestStatement = bundle.statements[0]
  const revenueEvidence: EvidenceRef[] = latestStatement?.income?.revenue?.evidence || []
  const operatingIncomeEvidence: EvidenceRef[] = latestStatement?.income?.operatingIncome?.evidence || []

  // 매출액 (근거 기반)
  if (revenueEvidence.length > 0 && latestStatement?.income?.revenue?.value) {
    const revenue = latestStatement.income.revenue.value
    const revenueFormatted = formatKRWAmount(revenue)
    
    summaryCards.push({
      label: '매출액',
      value: revenueFormatted,
      evidence: revenueEvidence,
    })

    const finding = createFinding(
      'step03-revenue',
      'Valuation',
      'info',
      `매출액: ${revenueFormatted}`,
      revenueEvidence,
      'skip'
    )
    if (finding) findings.push(finding)
  } else {
    summaryCards.push({
      label: '매출액',
      value: '계산 불가',
      note: '근거 부족',
    })
  }

  // 영업이익 (근거 기반)
  if (operatingIncomeEvidence.length > 0 && latestStatement?.income?.operatingIncome?.value) {
    const operatingIncome = latestStatement.income.operatingIncome.value
    const operatingIncomeFormatted = formatKRWAmount(operatingIncome)
    
    summaryCards.push({
      label: '영업이익',
      value: operatingIncomeFormatted,
      evidence: operatingIncomeEvidence,
    })
  } else {
    summaryCards.push({
      label: '영업이익',
      value: '계산 불가',
      note: '근거 부족',
    })
  }

  // 영업이익률: DerivedMetrics에서 계산된 값 사용 (기간 일치 검증 완료된 값)
  // 원칙: UI에서 재계산하지 않고, analysis bundle에서 확정된 값만 사용
  const derivedMetrics = bundle.derived[0]
  if (derivedMetrics?.opm !== undefined && derivedMetrics.opm !== null) {
    // DerivedMetrics에서 이미 기간 일치 검증이 완료된 영업이익률 사용
    summaryCards.push({
      label: '영업이익률',
      value: `${derivedMetrics.opm.toFixed(1)}%`,
      evidence: [...revenueEvidence, ...operatingIncomeEvidence],
    })
  } else {
    // DerivedMetrics에 값이 없으면 "계산 불가"로 표시 (추정 금지)
    summaryCards.push({
      label: '영업이익률',
      value: '계산 불가',
      note: derivedMetrics?.notes?.find(n => n.includes('영업이익률')) || '기간 불일치 또는 데이터 부족',
    })
  }

  // 시계열 차트 보고 (2개 이상 데이터 있을 때)
  if (bundle.statements.length >= 2) {
    const checkpoint = createCheckpoint(
      'step03-trend',
      '시계열 추이 모니터링',
      '연도별/분기별 매출 및 영업이익 추이',
      '성장 추세 파악을 위해 중요',
      '다음 분기 실적과 비교',
      revenueEvidence.length > 0 ? revenueEvidence : operatingIncomeEvidence,
      'warn'
    )
    if (checkpoint) checkpoints.push(checkpoint)
  }

  return {
    step: 3,
    title: STEP_TITLES[3],
    summaryCards,
    findings,
    checkpoints,
  }
}
