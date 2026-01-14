/**
 * Step 05: 현금흐름
 * OCF/CAPEX/FCF 구조, 변동 원인 후보(근거 텍스트가 없으면 후보 나열 금지)
 */

import type { AnalysisBundle, StepOutput, EvidenceRef } from '@/types/analysis-bundle'
import { createFinding, createCheckpoint } from '@/lib/analysis/evidence/assert-evidence'
import { STEP_TITLES } from '@/ui/labels/analysisSteps.ko'
import { generateEWSCheckpoints } from '@/lib/analysis/ews/ews-engine'
import { formatKRWAmount } from '@/lib/utils/unit-converter'

export function runStep05(bundle: AnalysisBundle): StepOutput {
  const findings: StepOutput['findings'] = []
  const checkpoints: StepOutput['checkpoints'] = []
  const summaryCards: StepOutput['summaryCards'] = []

  // 최신 재무제표에서 EvidenceRef 추출
  const latestStatement = bundle.statements[0]
  const ocfEvidence: EvidenceRef[] = latestStatement?.cashflow?.operatingCashFlow?.evidence || []
  const capexEvidence: EvidenceRef[] = latestStatement?.cashflow?.capitalExpenditure?.evidence || []
  const fcfEvidence: EvidenceRef[] = latestStatement?.cashflow?.freeCashFlow?.evidence || []

  // 영업현금흐름 (OCF) (근거 기반)
  if (ocfEvidence.length > 0 && latestStatement?.cashflow?.operatingCashFlow?.value) {
    const ocf = latestStatement.cashflow.operatingCashFlow.value
    const ocfFormatted = formatKRWAmount(ocf)
    
    summaryCards.push({
      label: '영업현금흐름',
      value: ocfFormatted,
      evidence: ocfEvidence,
    })
  } else {
    summaryCards.push({
      label: '영업현금흐름',
      value: '계산 불가',
      note: '근거 부족',
    })
  }

  // CAPEX (근거 기반)
  if (capexEvidence.length > 0 && latestStatement?.cashflow?.capitalExpenditure?.value) {
    const capex = latestStatement.cashflow.capitalExpenditure.value
    const capexFormatted = formatKRWAmount(capex)
    
    summaryCards.push({
      label: 'CAPEX',
      value: capexFormatted,
      evidence: capexEvidence,
    })
  } else {
    summaryCards.push({
      label: 'CAPEX',
      value: '계산 불가',
      note: '근거 부족',
    })
  }

  // FCF (근거 기반)
  if (fcfEvidence.length > 0 && latestStatement?.cashflow?.freeCashFlow?.value) {
    const fcf = latestStatement.cashflow.freeCashFlow.value
    const fcfFormatted = formatKRWAmount(fcf)
    
    summaryCards.push({
      label: 'FCF',
      value: fcfFormatted,
      evidence: fcfEvidence,
    })

    const finding = createFinding(
      'step05-fcf',
      'CashFlow',
      fcf > 0 ? 'info' : 'warn',
      `FCF: ${fcfFormatted}`,
      fcfEvidence,
      'skip'
    )
    if (finding) findings.push(finding)
  } else {
    summaryCards.push({
      label: 'FCF',
      value: '계산 불가',
      note: '근거 부족',
    })
  }

  // 변동 원인 후보 (근거 텍스트가 없으면 후보 나열 금지)
  // PDF에서 추출한 텍스트가 있을 때만 분석
  const hasTextEvidence = bundle.allEvidence.some(e => e.sourceType === 'PDF' && e.quote)
  if (hasTextEvidence && ocfEvidence.length > 0) {
    const checkpoint = createCheckpoint(
      'step05-cashflow-trend',
      '현금흐름 변동 모니터링',
      'OCF 변동 원인 분석',
      '현금흐름 품질 평가에 중요',
      '분기별 현금흐름 구조 변화 확인',
      ocfEvidence,
      'warn'
    )
    if (checkpoint) checkpoints.push(checkpoint)
  }

  // EWS 체크포인트 추가 (FCF 압박, CAPEX 급증 등)
  const ewsCheckpoints = generateEWSCheckpoints(bundle)
  // Step05와 관련된 EWS만 필터링 (FCF, CAPEX 관련)
  const relevantEWS = ewsCheckpoints.filter(cp => 
    cp.id.includes('fcf') || cp.id.includes('capex')
  )
  checkpoints.push(...relevantEWS)

  return {
    step: 5,
    title: STEP_TITLES[5],
    summaryCards,
    findings,
    checkpoints,
  }
}
