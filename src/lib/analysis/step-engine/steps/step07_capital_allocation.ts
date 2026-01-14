/**
 * Step 07: 자본배분
 * 배당/자사주/CAPEX/인수(근거 기반)
 */

import type { AnalysisBundle, StepOutput, EvidenceRef } from '@/types/analysis-bundle'
import { createFinding, createCheckpoint } from '@/lib/analysis/evidence/assert-evidence'
import { STEP_TITLES } from '@/ui/labels/analysisSteps.ko'
import { formatKRWAmount } from '@/lib/utils/unit-converter'

export function runStep07(bundle: AnalysisBundle): StepOutput {
  const findings: StepOutput['findings'] = []
  const checkpoints: StepOutput['checkpoints'] = []
  const summaryCards: StepOutput['summaryCards'] = []

  // 최신 재무제표에서 EvidenceRef 추출
  const latestStatement = bundle.statements[0]
  const capexEvidence: EvidenceRef[] = latestStatement?.cashflow?.capitalExpenditure?.evidence || []
  const financingEvidence: EvidenceRef[] = latestStatement?.cashflow?.financingCashFlow?.evidence || []

  // CAPEX (Step05에서 재사용)
  if (capexEvidence.length > 0 && latestStatement?.cashflow?.capitalExpenditure?.value) {
    const capex = latestStatement.cashflow.capitalExpenditure.value
    const capexFormatted = formatKRWAmount(capex)
    
    summaryCards.push({
      label: 'CAPEX',
      value: capexFormatted,
      evidence: capexEvidence,
    })
  }

  // 배당/자사주 (재무현금흐름에서 추론, 근거 기반)
  if (financingEvidence.length > 0) {
    const finding = createFinding(
      'step07-dividend-buyback',
      'Governance',
      'info',
      '배당 및 자사주 매입 분석 필요',
      financingEvidence,
      'warn'
    )
    if (finding) findings.push(finding)
  }

  // 인수 (근거 기반 - PDF 텍스트에서 추출)
  const hasMergerInfo = bundle.allEvidence.some(e => 
    e.sourceType === 'PDF' && e.quote && (
      e.quote.includes('인수') || 
      e.quote.includes('합병') || 
      e.quote.includes('M&A')
    )
  )
  if (hasMergerInfo) {
    const mergerEvidence = bundle.allEvidence.filter(e => 
      e.sourceType === 'PDF' && e.quote && (
        e.quote.includes('인수') || 
        e.quote.includes('합병') || 
        e.quote.includes('M&A')
      )
    )
    const finding = createFinding(
      'step07-merger',
      'Governance',
      'info',
      '인수합병 관련 정보 발견',
      mergerEvidence,
      'skip'
    )
    if (finding) findings.push(finding)
  }

  // 자본배분 전략 체크포인트
  if (capexEvidence.length > 0 || financingEvidence.length > 0) {
    const checkpoint = createCheckpoint(
      'step07-allocation',
      '자본배분 전략 모니터링',
      '배당, 자사주 매입, CAPEX, 인수합병',
      '자본 효율성 평가에 중요',
      '분기별 자본배분 계획 확인',
      [...capexEvidence, ...financingEvidence].filter((e, i, arr) => 
        arr.findIndex(a => a.fileId === e.fileId && a.locator.tag === e.locator.tag) === i
      ),
      'warn'
    )
    if (checkpoint) checkpoints.push(checkpoint)
  }

  return {
    step: 7,
    title: STEP_TITLES[7],
    summaryCards,
    findings,
    checkpoints,
  }
}
