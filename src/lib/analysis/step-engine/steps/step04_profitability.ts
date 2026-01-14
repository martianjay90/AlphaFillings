/**
 * Step 04: 수익성/ROIC
 * roic 가능 시 제시, 불가 시 "계산 불가(근거)"만
 */

import type { AnalysisBundle, StepOutput, EvidenceRef } from '@/types/analysis-bundle'
import { createFinding, createCheckpoint } from '@/lib/analysis/evidence/assert-evidence'
import { STEP_TITLES } from '@/ui/labels/analysisSteps.ko'

export function runStep04(bundle: AnalysisBundle): StepOutput {
  const findings: StepOutput['findings'] = []
  const checkpoints: StepOutput['checkpoints'] = []
  const summaryCards: StepOutput['summaryCards'] = []

  // 최신 재무제표에서 EvidenceRef 추출
  const latestStatement = bundle.statements[0]
  const derivedMetrics = bundle.derived[0]

  // ROIC 계산 (가능한 경우만)
  if (derivedMetrics?.roic !== undefined) {
    const roicEvidence: EvidenceRef[] = derivedMetrics.evidence || []
    
    if (roicEvidence.length > 0) {
      summaryCards.push({
        label: 'ROIC',
        value: derivedMetrics.roic.toFixed(1) + '%',
        evidence: roicEvidence,
      })

      const finding = createFinding(
        'step04-roic',
        'Valuation',
        derivedMetrics.roic > 10 ? 'info' : 'warn',
        `ROIC: ${derivedMetrics.roic.toFixed(1)}%`,
        roicEvidence,
        'skip'
      )
      if (finding) findings.push(finding)
    } else {
      summaryCards.push({
        label: 'ROIC',
        value: '계산 불가',
        note: '근거 부족',
      })
    }
  } else {
    summaryCards.push({
      label: 'ROIC',
      value: '계산 불가',
      note: '근거 부족',
    })
  }

  // 영업이익률: DerivedMetrics에서 계산된 값 사용 (기간 일치 검증 완료된 값)
  // 원칙: UI에서 재계산하지 않고, analysis bundle에서 확정된 값만 사용
  if (derivedMetrics?.opm !== undefined && derivedMetrics.opm !== null) {
    const opmEvidence: EvidenceRef[] = [
      ...(latestStatement?.income?.revenue?.evidence || []),
      ...(latestStatement?.income?.operatingIncome?.evidence || []),
    ]
    
    if (opmEvidence.length > 0) {
      summaryCards.push({
        label: '영업이익률',
        value: derivedMetrics.opm.toFixed(1) + '%',
        evidence: opmEvidence,
      })
    }
  }

  return {
    step: 4,
    title: STEP_TITLES[4],
    summaryCards,
    findings,
    checkpoints,
  }
}
