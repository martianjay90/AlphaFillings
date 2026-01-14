/**
 * Evidence 강제 유틸
 * StepOutput의 핵심 문장/경고/체크포인트는 EvidenceRef가 1개 이상 반드시 필요
 */

import type { Finding, Checkpoint, EvidenceRef } from '@/types/analysis-bundle'

/**
 * Evidence가 비어있는 경우 처리 옵션
 */
export type EvidencePolicy = 'skip' | 'warn'

/**
 * Finding 생성 (Evidence 필수)
 * evidence가 비어있으면 정책에 따라 처리
 */
export function createFinding(
  id: string,
  category: Finding['category'],
  severity: Finding['severity'],
  text: string,
  evidence: EvidenceRef[],
  policy: EvidencePolicy = 'warn'
): Finding | null {
  if (evidence.length === 0) {
    if (policy === 'skip') {
      // Finding을 생성하지 않음
      return null
    } else {
      // "근거 필요" 텍스트로 대체하고 severity=warn 처리
      return {
        id,
        category,
        severity: 'warn',
        text: `${text} (근거 필요)`,
        evidence: [],
      }
    }
  }

  return {
    id,
    category,
    severity,
    text,
    evidence,
  }
}

/**
 * Checkpoint 생성 (Evidence 필수)
 * evidence가 비어있으면 정책에 따라 처리
 */
export function createCheckpoint(
  id: string,
  title: string,
  whatToWatch: string,
  whyItMatters: string,
  nextQuarterAction: string,
  evidence: EvidenceRef[],
  policy: EvidencePolicy = 'warn'
): Checkpoint | null {
  if (evidence.length === 0) {
    if (policy === 'skip') {
      // Checkpoint를 생성하지 않음
      return null
    } else {
      // "근거 필요" 텍스트로 대체
      return {
        id,
        title: `${title} (근거 필요)`,
        whatToWatch: `${whatToWatch} (근거 필요)`,
        whyItMatters: `${whyItMatters} (근거 필요)`,
        nextQuarterAction: `${nextQuarterAction} (근거 필요)`,
        evidence: [],
      }
    }
  }

  return {
    id,
    title,
    whatToWatch,
    whyItMatters,
    nextQuarterAction,
    evidence,
  }
}

/**
 * Evidence 배열 필터링 (빈 배열 제거)
 */
export function filterFindingsWithEvidence(
  findings: (Finding | null)[]
): Finding[] {
  return findings.filter((f): f is Finding => f !== null && f.evidence.length > 0)
}

/**
 * Checkpoint 배열 필터링 (빈 배열 제거)
 */
export function filterCheckpointsWithEvidence(
  checkpoints: (Checkpoint | null)[]
): Checkpoint[] {
  return checkpoints.filter((c): c is Checkpoint => c !== null && c.evidence.length > 0)
}

/**
 * Evidence가 있는지 확인
 */
export function hasEvidence(evidence: EvidenceRef[]): boolean {
  return evidence.length > 0
}

/**
 * Evidence가 없을 때 기본 메시지 생성
 */
export function createNoEvidenceMessage(originalText: string): string {
  return `${originalText} (근거 부족)`
}
