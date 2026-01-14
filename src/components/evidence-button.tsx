"use client"

import React from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
// Tooltip 컴포넌트가 없으므로 title 속성 사용
import type { EvidenceRef } from '@/types/analysis-bundle'
import { filterPDFEvidence, hasUserVisibleEvidence, extractPDFInfo } from '@/lib/utils/evidence-filter'
import { UI_TEXT } from '@/ui/labels/analysisSteps.ko'
import type { SourceDocument } from '@/lib/agents/librarian'

interface EvidenceButtonProps {
  /** EvidenceRef 배열 */
  evidence?: EvidenceRef[]
  
  /** 소스 문서 배열 (PDF 찾기용) */
  sourceDocuments?: SourceDocument[]
  
  /** 클릭 핸들러 (fileId, pageNumber를 인자로 받음) */
  onEvidenceClick?: (fileId: string, pageNumber?: number) => void
  
  /** 버튼 크기 */
  size?: 'sm' | 'default'
  
  /** 버튼 텍스트 */
  label?: string
  
  /** className */
  className?: string
}

/**
 * 원문 보기 버튼 컴포넌트
 * - PDF 근거만 표시 (XBRL은 내부 디버그용으로만 사용)
 * - 근거가 없으면 버튼 숨김 또는 disabled
 */
export function EvidenceButton({
  evidence,
  sourceDocuments = [],
  onEvidenceClick,
  size = 'sm',
  label = UI_TEXT.viewOriginal,
  className = '',
}: EvidenceButtonProps) {

  // PDF 근거만 필터링
  const pdfEvidence = filterPDFEvidence(evidence)
  
  // 사용자 화면에 표시할 근거가 있는지 확인
  const hasVisibleEvidence = hasUserVisibleEvidence(evidence)

  // 근거가 없으면 버튼 숨김
  if (!hasVisibleEvidence) {
    return null
  }

  // 첫 번째 PDF 근거 정보 추출 (우선순위: pageNumber 있음 > 없음)
  const pdfInfo = pdfEvidence
    .map(e => extractPDFInfo(e))
    .filter((info): info is NonNullable<typeof info> => info !== null)
    .sort((a, b) => {
      // pageNumber가 있는 것을 우선
      if (a.pageNumber && !b.pageNumber) return -1
      if (!a.pageNumber && b.pageNumber) return 1
      return 0
    })[0]

  if (!pdfInfo) {
    return null
  }

  // 소스 문서 찾기 (fileId로 매칭)
  // fileId는 파일명 일부 또는 전체일 수 있음
  const sourceDoc = sourceDocuments.find(
    doc => {
      const docTitle = doc.title || ''
      const docFileId = (doc as any).fileId || (doc as any).id || ''
      return docTitle.includes(pdfInfo.fileId) || 
             docFileId === pdfInfo.fileId ||
             pdfInfo.fileId.includes(docTitle) ||
             pdfInfo.fileId.includes(docFileId)
    }
  ) as SourceDocument | undefined

  const handleClick = () => {
    if (onEvidenceClick && pdfInfo) {
      // 커스텀 핸들러가 있으면 우선 사용
      onEvidenceClick(pdfInfo.fileId, pdfInfo.pageNumber)
    } else if (sourceDoc?.url) {
      // 기본 동작: PDF URL 열기 (pageNumber가 있으면 앵커 추가)
      let url = sourceDoc.url
      if (pdfInfo.pageNumber) {
        // PDF.js 뷰어나 브라우저 PDF 뷰어에서 페이지 앵커 지원
        // 일반적으로 #page= 형식 사용
        url = `${url}#page=${pdfInfo.pageNumber}`
      }
      window.open(url, '_blank')
    } else {
      // 소스 문서를 찾을 수 없으면 경고
      console.warn('[EvidenceButton] PDF 소스 문서를 찾을 수 없습니다:', pdfInfo.fileId)
    }
  }

  // 툴팁 텍스트 생성
  const tooltipText = pdfInfo.pageNumber
    ? `PDF ${pdfInfo.pageNumber}페이지 (${pdfInfo.quote ? pdfInfo.quote.substring(0, 50) + '...' : '원문 보기'})`
    : pdfInfo.quote
    ? `PDF 원문 보기 (${pdfInfo.quote.substring(0, 50)}...)`
    : 'PDF 원문 보기'

  return (
    <Button
      variant="ghost"
      size={size}
      className={`inline-flex items-center gap-1 text-primary hover:text-primary/80 ${className}`}
      onClick={handleClick}
      title={tooltipText}
    >
      <FileText className="h-3 w-3" />
      <span className="text-xs">[{label}]</span>
    </Button>
  )
}

/**
 * 여러 근거가 있을 때 모든 근거를 보여주는 버튼 그룹
 */
export function EvidenceButtonGroup({
  evidence,
  sourceDocuments = [],
  onEvidenceClick,
  className = '',
}: Omit<EvidenceButtonProps, 'size' | 'label'>) {
  const pdfEvidence = filterPDFEvidence(evidence)
  
  if (pdfEvidence.length === 0) {
    return null
  }

  if (pdfEvidence.length === 1) {
    return (
      <EvidenceButton
        evidence={evidence}
        sourceDocuments={sourceDocuments}
        onEvidenceClick={onEvidenceClick}
        className={className}
      />
    )
  }

  // 여러 근거가 있으면 드롭다운 또는 첫 번째 근거만 표시
  // TODO: 드롭다운 메뉴 구현 가능
  return (
    <EvidenceButton
      evidence={[pdfEvidence[0]]}
      sourceDocuments={sourceDocuments}
      onEvidenceClick={onEvidenceClick}
      label={`${UI_TEXT.viewOriginal} (${pdfEvidence.length})`}
      className={className}
    />
  )
}
