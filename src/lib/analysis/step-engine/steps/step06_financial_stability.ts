/**
 * Step 06: 재무안정
 * 부채/유동성/만기(가능하면) + 리스크
 */

import type { AnalysisBundle, StepOutput, EvidenceRef } from '@/types/analysis-bundle'
import { createFinding, createCheckpoint } from '@/lib/analysis/evidence/assert-evidence'
import { STEP_TITLES } from '@/ui/labels/analysisSteps.ko'

export function runStep06(bundle: AnalysisBundle): StepOutput {
  const findings: StepOutput['findings'] = []
  const checkpoints: StepOutput['checkpoints'] = []
  const summaryCards: StepOutput['summaryCards'] = []

  // 최신 재무제표에서 EvidenceRef 추출
  const latestStatement = bundle.statements[0]
  const totalAssetsEvidence: EvidenceRef[] = latestStatement?.balance?.totalAssets?.evidence || []
  const totalLiabilitiesEvidence: EvidenceRef[] = latestStatement?.balance?.totalLiabilities?.evidence || []
  const totalEquityEvidence: EvidenceRef[] = latestStatement?.balance?.totalEquity?.evidence || []

  // 부채비율 (근거 기반)
  if (totalLiabilitiesEvidence.length > 0 && totalEquityEvidence.length > 0 &&
      latestStatement?.balance?.totalLiabilities?.value && latestStatement?.balance?.totalEquity?.value) {
    const liabilities = latestStatement.balance.totalLiabilities.value
    const equity = latestStatement.balance.totalEquity.value
    const debtRatio = equity > 0 ? (liabilities / equity) * 100 : 0
    
    summaryCards.push({
      label: '부채비율',
      value: debtRatio.toFixed(1) + '%',
      evidence: [...totalLiabilitiesEvidence, ...totalEquityEvidence],
    })

    const finding = createFinding(
      'step06-debt-ratio',
      'BalanceSheet',
      debtRatio > 200 ? 'risk' : debtRatio > 100 ? 'warn' : 'info',
      `부채비율: ${debtRatio.toFixed(1)}%`,
      [...totalLiabilitiesEvidence, ...totalEquityEvidence],
      'skip'
    )
    if (finding) findings.push(finding)
  } else {
    summaryCards.push({
      label: '부채비율',
      value: '계산 불가',
      note: '근거 부족',
    })
  }

  // 유동성 (근거 기반)
  if (totalAssetsEvidence.length > 0 && totalLiabilitiesEvidence.length > 0) {
    const checkpoint = createCheckpoint(
      'step06-liquidity',
      '유동성 모니터링',
      '유동비율 및 당좌비율',
      '단기 자금 조달 능력 평가에 중요',
      '분기별 유동성 지표 확인',
      [...totalAssetsEvidence, ...totalLiabilitiesEvidence],
      'warn'
    )
    if (checkpoint) checkpoints.push(checkpoint)
  }

  // 만기 구조 (가능하면)
  // XBRL에서 만기 정보 추출 가능한 경우만
  const hasMaturityInfo = bundle.allEvidence.some(e => 
    e.sourceType === 'XBRL' && e.locator.tag?.includes('Maturity')
  )
  if (hasMaturityInfo) {
    const maturityEvidence = bundle.allEvidence.filter(e => 
      e.sourceType === 'XBRL' && e.locator.tag?.includes('Maturity')
    )
    const finding = createFinding(
      'step06-maturity',
      'BalanceSheet',
      'info',
      '부채 만기 구조 분석 필요',
      maturityEvidence,
      'warn'
    )
    if (finding) findings.push(finding)
  }

  return {
    step: 6,
    title: STEP_TITLES[6],
    summaryCards,
    findings,
    checkpoints,
  }
}
