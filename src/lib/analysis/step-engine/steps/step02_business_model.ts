/**
 * Step 02: BM/해자
 * 돈버는 방식, 가격결정력, 전환비용, 규모의 경제 분석
 */

import type { AnalysisBundle, StepOutput, EvidenceRef } from '@/types/analysis-bundle'
import { createFinding, createCheckpoint } from '@/lib/analysis/evidence/assert-evidence'
import { STEP_TITLES } from '@/ui/labels/analysisSteps.ko'

export function runStep02(bundle: AnalysisBundle): StepOutput {
  const findings: StepOutput['findings'] = []
  const checkpoints: StepOutput['checkpoints'] = []
  const summaryCards: StepOutput['summaryCards'] = []

  // 기본 EvidenceRef 생성
  const defaultEvidence: EvidenceRef[] = bundle.allEvidence.length > 0
    ? [bundle.allEvidence[0]]
    : []

  // 돈버는 방식 (근거 기반)
  if (defaultEvidence.length > 0) {
    const finding = createFinding(
      'step02-revenue-model',
      'Valuation',
      'info',
      '수익 모델 분석 필요',
      defaultEvidence,
      'warn'
    )
    if (finding) findings.push(finding)
  }

  // 가격결정력 (근거 기반)
  if (defaultEvidence.length > 0) {
    const finding = createFinding(
      'step02-pricing-power',
      'Valuation',
      'info',
      '가격결정력 분석 필요',
      defaultEvidence,
      'warn'
    )
    if (finding) findings.push(finding)
  }

  // 전환비용 (근거 기반)
  if (defaultEvidence.length > 0) {
    const finding = createFinding(
      'step02-switching-cost',
      'Valuation',
      'info',
      '고객 전환비용 분석 필요',
      defaultEvidence,
      'warn'
    )
    if (finding) findings.push(finding)
  }

  // 규모의 경제 (근거 기반)
  if (defaultEvidence.length > 0) {
    const checkpoint = createCheckpoint(
      'step02-economies-of-scale',
      '규모의 경제 모니터링',
      '매출 증가 대비 비용 증가율',
      '규모의 경제 실현 여부가 수익성 개선에 중요',
      '분기별 비용 구조 변화 확인',
      defaultEvidence,
      'warn'
    )
    if (checkpoint) checkpoints.push(checkpoint)
  }

  return {
    step: 2,
    title: STEP_TITLES[2],
    summaryCards,
    findings,
    checkpoints,
  }
}
