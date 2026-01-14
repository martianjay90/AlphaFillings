/**
 * Step 10: 촉매/시장오버레이
 * 최근 30~90일(향후 추가) / 지금은 내부 데이터만이면 비활성
 */

import type { AnalysisBundle, StepOutput, EvidenceRef } from '@/types/analysis-bundle'
import { createFinding, createCheckpoint } from '@/lib/analysis/evidence/assert-evidence'
import { STEP_TITLES } from '@/ui/labels/analysisSteps.ko'

export function runStep10(bundle: AnalysisBundle): StepOutput {
  const findings: StepOutput['findings'] = []
  const checkpoints: StepOutput['checkpoints'] = []
  const summaryCards: StepOutput['summaryCards'] = []

  // 현재는 내부 데이터만이면 비활성
  // 향후 외부 API 연동 시 활성화 예정
  
  summaryCards.push({
    label: '촉매/시장오버레이',
    value: '비활성',
    note: '향후 외부 데이터 연동 예정',
  })

  // 기본 EvidenceRef 생성 (향후 사용)
  const defaultEvidence: EvidenceRef[] = bundle.allEvidence.length > 0
    ? [bundle.allEvidence[0]]
    : []

  // 향후 구현 예정 안내
  if (defaultEvidence.length > 0) {
    const finding = createFinding(
      'step10-catalyst',
      'MarketOverlay',
      'info',
      '촉매 이벤트 분석 (향후 구현 예정)',
      defaultEvidence,
      'warn'
    )
    if (finding) findings.push(finding)
  }

  return {
    step: 10,
    title: STEP_TITLES[10],
    summaryCards,
    findings,
    checkpoints,
  }
}
