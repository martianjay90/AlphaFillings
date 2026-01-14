/**
 * Step 11: 매매/판정
 * 선택/보류/배제 + 근거 Top3 + 재검토 조건 Top3 + 체크포인트 요약
 */

import type { AnalysisBundle, StepOutput, EvidenceRef } from '@/types/analysis-bundle'
import { createFinding, createCheckpoint } from '@/lib/analysis/evidence/assert-evidence'
import { STEP_TITLES } from '@/ui/labels/analysisSteps.ko'
import { generateEWSCheckpoints } from '@/lib/analysis/ews/ews-engine'

export function runStep11(
  bundle: AnalysisBundle,
  previousStepOutputs: StepOutput[]
): StepOutput {
  const findings: StepOutput['findings'] = []
  const checkpoints: StepOutput['checkpoints'] = []
  const summaryCards: StepOutput['summaryCards'] = []

  // 모든 StepOutput에서 체크포인트 수집 (이전 Step 1-10 결과 사용)
  const allCheckpoints = previousStepOutputs.flatMap(step => step.checkpoints)
  
  // 근거 Top3 수집 (가장 많은 EvidenceRef를 가진 Finding/Checkpoint)
  const allFindings = previousStepOutputs.flatMap(step => step.findings)
  const topFindings = allFindings
    .filter(f => f.evidence.length > 0)
    .sort((a, b) => b.evidence.length - a.evidence.length)
    .slice(0, 3)

  // 판정 근거 Top3
  if (topFindings.length > 0) {
    topFindings.forEach((finding, index) => {
      const summaryCard = {
        label: `판정 근거 ${index + 1}`,
        value: finding.text.substring(0, 50) + (finding.text.length > 50 ? '...' : ''),
        evidence: finding.evidence,
      }
      summaryCards.push(summaryCard)
    })
  } else {
    summaryCards.push({
      label: '판정 근거',
      value: '근거 부족',
      note: '분석 데이터 부족',
    })
  }

  // 판정 결과 (간단한 로직)
  const riskFindings = allFindings.filter(f => f.severity === 'risk')
  const warnFindings = allFindings.filter(f => f.severity === 'warn')
  
  let decision: '선택' | '보류' | '배제' = '보류'
  if (riskFindings.length === 0 && warnFindings.length <= 2) {
    decision = '선택'
  } else if (riskFindings.length >= 3) {
    decision = '배제'
  }

  summaryCards.push({
    label: '판정',
    value: decision,
    evidence: topFindings.length > 0 ? topFindings[0].evidence : [],
  })

  // 재검토 조건 Top3 (Checkpoint에서 추출)
  const topCheckpoints = allCheckpoints
    .filter(c => c.evidence.length > 0)
    .sort((a, b) => b.evidence.length - a.evidence.length)
    .slice(0, 3)

  topCheckpoints.forEach((checkpoint, index) => {
    const finding = createFinding(
      `step11-review-${index + 1}`,
      'Risk',
      'warn',
      `재검토 조건 ${index + 1}: ${checkpoint.whatToWatch}`,
      checkpoint.evidence,
      'skip'
    )
    if (finding) findings.push(finding)
  })

  // EWS 체크포인트 추가 (가이던스/전망 등)
  const ewsCheckpoints = generateEWSCheckpoints(bundle)
  // Step11과 관련된 EWS만 필터링 (가이던스 관련)
  const relevantEWS = ewsCheckpoints.filter(cp => 
    cp.id.includes('guidance')
  )
  checkpoints.push(...relevantEWS)

  // 체크포인트 요약
  if (allCheckpoints.length > 0) {
    const checkpointSummary = allCheckpoints
      .map(c => c.title)
      .join(', ')
    
    const checkpointEvidence = allCheckpoints
      .flatMap(c => c.evidence)
      .filter((e, i, arr) => 
        arr.findIndex(a => a.fileId === e.fileId && a.locator.tag === e.locator.tag) === i
      )

    const checkpoint = createCheckpoint(
      'step11-summary',
      '체크포인트 요약',
      checkpointSummary,
      '주요 모니터링 항목 종합',
      '분기별 재검토',
      checkpointEvidence,
      'warn'
    )
    if (checkpoint) checkpoints.push(checkpoint)
  }

  return {
    step: 11,
    title: STEP_TITLES[11],
    summaryCards,
    findings,
    checkpoints,
  }
}
