/**
 * Step 08: 밸류에이션
 * 3엔진 결과(가능한 것만) + 안전마진, 불가 시 "입력/근거 부족"
 */

import type { AnalysisBundle, StepOutput, EvidenceRef } from '@/types/analysis-bundle'
import { createFinding, createCheckpoint } from '@/lib/analysis/evidence/assert-evidence'
import { STEP_TITLES } from '@/ui/labels/analysisSteps.ko'
import { formatKRWAmount } from '@/lib/utils/unit-converter'

export function runStep08(bundle: AnalysisBundle): StepOutput {
  const findings: StepOutput['findings'] = []
  const checkpoints: StepOutput['checkpoints'] = []
  const summaryCards: StepOutput['summaryCards'] = []

  // 최신 재무제표에서 EvidenceRef 추출
  const latestStatement = bundle.statements[0]
  const revenueEvidence: EvidenceRef[] = latestStatement?.income?.revenue?.evidence || []
  const fcfEvidence: EvidenceRef[] = latestStatement?.cashflow?.freeCashFlow?.evidence || []

  // DCF 밸류에이션 (가능한 경우만) - 추정 금지: 실제 DCF 계산이 불가하므로 제거
  // 추정치 표시 금지 정책에 따라 DCF는 제거하거나 "계산 불가"로 표시
  summaryCards.push({
    label: 'DCF 밸류에이션',
    value: '계산 불가',
    note: '입력/근거 부족',
  })

  // P/E 밸류에이션 (가능한 경우만)
  if (revenueEvidence.length > 0 && latestStatement?.income?.revenue?.value) {
    summaryCards.push({
      label: 'P/E 밸류에이션',
      value: '계산 불가',
      note: '시가총액 정보 필요',
    })
  } else {
    summaryCards.push({
      label: 'P/E 밸류에이션',
      value: '계산 불가',
      note: '입력/근거 부족',
    })
  }

  // 안전마진 (가능한 경우만) - 추정 금지: 실제 계산 불가 시 체크포인트 제거
  // 현재는 FCF 기반 기업가치 계산이 불가하므로 체크포인트 미생성

  return {
    step: 8,
    title: STEP_TITLES[8],
    summaryCards,
    findings,
    checkpoints,
  }
}
