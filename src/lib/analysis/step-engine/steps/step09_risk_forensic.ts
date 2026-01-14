/**
 * Step 09: 리스크/포렌식
 * DSO/재고/충당금/회계정책 변경 키워드(근거 필수)
 */

import type { AnalysisBundle, StepOutput, EvidenceRef } from '@/types/analysis-bundle'
import { createFinding, createCheckpoint } from '@/lib/analysis/evidence/assert-evidence'
import { STEP_TITLES } from '@/ui/labels/analysisSteps.ko'
import { generateEWSCheckpoints } from '@/lib/analysis/ews/ews-engine'

export function runStep09(bundle: AnalysisBundle): StepOutput {
  const findings: StepOutput['findings'] = []
  const checkpoints: StepOutput['checkpoints'] = []
  const summaryCards: StepOutput['summaryCards'] = []

  // 최신 재무제표에서 EvidenceRef 추출
  const latestStatement = bundle.statements[0]
  const accountsReceivableEvidence: EvidenceRef[] = latestStatement?.balance?.accountsReceivable?.evidence || []
  const inventoryEvidence: EvidenceRef[] = latestStatement?.balance?.inventory?.evidence || []

  // DSO (매출채권 회전일수) - 근거 필수
  if (accountsReceivableEvidence.length > 0 && 
      latestStatement?.balance?.accountsReceivable?.value &&
      latestStatement?.income?.revenue?.value) {
    const ar = latestStatement.balance.accountsReceivable.value
    const revenue = latestStatement.income.revenue.value
    const dso = revenue > 0 ? (ar / revenue) * 365 : 0
    
    const finding = createFinding(
      'step09-dso',
      'EarningsQuality',
      dso > 90 ? 'warn' : 'info',
      `DSO: ${dso.toFixed(0)}일`,
      accountsReceivableEvidence,
      'skip'
    )
    if (finding) findings.push(finding)
  } else {
    const finding = createFinding(
      'step09-dso',
      'EarningsQuality',
      'warn',
      'DSO 계산 불가 (근거 부족)',
      [],
      'warn'
    )
    if (finding) findings.push(finding)
  }

  // 재고 회전율 - 근거 필수
  if (inventoryEvidence.length > 0 && 
      latestStatement?.balance?.inventory?.value &&
      latestStatement?.income?.revenue?.value) {
    const inventory = latestStatement.balance.inventory.value
    const revenue = latestStatement.income.revenue.value
    const inventoryTurnover = inventory > 0 ? revenue / inventory : 0
    
    const finding = createFinding(
      'step09-inventory',
      'EarningsQuality',
      inventoryTurnover < 4 ? 'warn' : 'info',
      `재고 회전율: ${inventoryTurnover.toFixed(1)}회`,
      inventoryEvidence,
      'skip'
    )
    if (finding) findings.push(finding)
  } else {
    const finding = createFinding(
      'step09-inventory',
      'EarningsQuality',
      'warn',
      '재고 회전율 계산 불가 (근거 부족)',
      [],
      'warn'
    )
    if (finding) findings.push(finding)
  }

  // 충당금 - 근거 필수 (PDF 텍스트에서 추출)
  const hasProvisionInfo = bundle.allEvidence.some(e => 
    e.sourceType === 'PDF' && e.quote && (
      e.quote.includes('충당금') || 
      e.quote.includes('준비금')
    )
  )
  if (hasProvisionInfo) {
    const provisionEvidence = bundle.allEvidence.filter(e => 
      e.sourceType === 'PDF' && e.quote && (
        e.quote.includes('충당금') || 
        e.quote.includes('준비금')
      )
    )
    const finding = createFinding(
      'step09-provision',
      'Risk',
      'info',
      '충당금 관련 정보 발견',
      provisionEvidence,
      'skip'
    )
    if (finding) findings.push(finding)
  }

  // 회계정책 변경 - 근거 필수 (PDF 텍스트에서 추출)
  const hasAccountingChange = bundle.allEvidence.some(e => 
    e.sourceType === 'PDF' && e.quote && (
      e.quote.includes('회계정책') || 
      e.quote.includes('회계처리') ||
      e.quote.includes('회계기준')
    )
  )
  if (hasAccountingChange) {
    const accountingChangeEvidence = bundle.allEvidence.filter(e => 
      e.sourceType === 'PDF' && e.quote && (
        e.quote.includes('회계정책') || 
        e.quote.includes('회계처리') ||
        e.quote.includes('회계기준')
      )
    )
    const finding = createFinding(
      'step09-accounting-change',
      'Risk',
      'warn',
      '회계정책 변경 관련 정보 발견',
      accountingChangeEvidence,
      'skip'
    )
    if (finding) findings.push(finding)
  }

  // EWS 체크포인트 추가 (운전자본, 일회성/품질 경고 등)
  const ewsCheckpoints = generateEWSCheckpoints(bundle)
  // Step09와 관련된 EWS만 필터링 (운전자본, 품질 관련)
  const relevantEWS = ewsCheckpoints.filter(cp => 
    cp.id.includes('inventory') || 
    cp.id.includes('dso') || 
    cp.id.includes('quality')
  )
  checkpoints.push(...relevantEWS)

  return {
    step: 9,
    title: STEP_TITLES[9],
    summaryCards,
    findings,
    checkpoints,
  }
}
