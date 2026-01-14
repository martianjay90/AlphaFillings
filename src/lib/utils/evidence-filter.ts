/**
 * Evidence 필터링 유틸리티
 * 사용자 화면에서는 PDF 근거만 표시, XBRL은 내부 디버그용으로만 사용
 */

import type { EvidenceRef } from '@/types/analysis-bundle'

/**
 * PDF 근거만 필터링 (사용자 화면용)
 * @param evidence EvidenceRef 배열
 * @returns PDF 타입의 EvidenceRef만 반환
 */
export function filterPDFEvidence(evidence: EvidenceRef[] | undefined): EvidenceRef[] {
  if (!evidence || evidence.length === 0) {
    return []
  }
  
  return evidence.filter(e => e.sourceType === 'PDF')
}

/**
 * XBRL 근거만 필터링 (내부 디버그용)
 * @param evidence EvidenceRef 배열
 * @returns XBRL 타입의 EvidenceRef만 반환
 */
export function filterXBRLEvidence(evidence: EvidenceRef[] | undefined): EvidenceRef[] {
  if (!evidence || evidence.length === 0) {
    return []
  }
  
  return evidence.filter(e => e.sourceType === 'XBRL')
}

/**
 * 사용자 화면에 표시할 수 있는 근거가 있는지 확인
 * @param evidence EvidenceRef 배열
 * @returns PDF 근거가 하나라도 있으면 true
 */
export function hasUserVisibleEvidence(evidence: EvidenceRef[] | undefined): boolean {
  return filterPDFEvidence(evidence).length > 0
}

/**
 * EvidenceRef에서 PDF 정보 추출
 * @param evidence EvidenceRef
 * @returns PDF 파일 ID, 페이지 번호, 인용문 또는 null
 */
export function extractPDFInfo(evidence: EvidenceRef): {
  fileId: string
  pageNumber?: number
  quote?: string
} | null {
  if (evidence.sourceType !== 'PDF') {
    return null
  }
  
  return {
    fileId: evidence.fileId,
    pageNumber: evidence.locator.page,
    quote: evidence.quote,
  }
}
