"use client"

import { useState, useEffect, useRef } from 'react'
import { X, FileText, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import type { SourceDocument, ReportSourceLink } from '@/lib/agents/librarian'
import { handleSmartLinkClick } from '@/lib/agents/librarian'

interface SourceViewerProps {
  /** 뷰어 열림 여부 */
  isOpen: boolean;
  
  /** 뷰어 닫기 핸들러 */
  onClose: () => void;
  
  /** 현재 문서 */
  document?: SourceDocument;
  
  /** 활성 링크 */
  activeLink?: ReportSourceLink;
  
  /** 문서 내용 (PDF의 경우 base64 또는 URL) */
  documentContent?: string;
}

export function SourceViewer({
  isOpen,
  onClose,
  document,
  activeLink,
  documentContent
}: SourceViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // 활성 링크 변경 시 페이지 이동
  useEffect(() => {
    if (activeLink?.targetPage && viewerRef.current) {
      setCurrentPage(activeLink.targetPage);
      handleSmartLinkClick(activeLink, viewerRef.current);
    }
  }, [activeLink]);

  // pageNumber를 직접 받아서 페이지 이동하는 경우 (EvidenceRef에서)
  const handlePageJump = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    // PDF 뷰어에서 해당 페이지로 스크롤 (PDF.js 구현 시)
    // 현재는 플레이스홀더
    if (viewerRef.current) {
      viewerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // 외부에서 pageNumber로 직접 이동할 수 있도록 expose (필요 시)
  // useEffect(() => {
  //   (window as any).__sourceViewerJumpToPage = handlePageJump;
  //   return () => {
  //     delete (window as any).__sourceViewerJumpToPage;
  //   };
  // }, []);

  if (!isOpen || !document) {
    return null;
  }

  return (
    <>
      {/* 오버레이 */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* 뷰어 사이드바 */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-full max-w-2xl z-50 transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="h-full glass-dark border-l border-border/50 flex flex-col">
          {/* 헤더 */}
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold text-sm">{document.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {document.type === 'DART_PDF' ? 'DART PDF' : 
                   document.type === 'SEC_IXBRL' ? 'SEC iXBRL' : 'DART XBRL'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {document.url && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => window.open(document.url, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 뷰어 콘텐츠 */}
          <div ref={viewerRef} className="flex-1 overflow-auto p-4">
            {document.type === 'DART_PDF' || document.type === 'SEC_IXBRL' ? (
              <PDFViewer
                document={document}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                documentContent={documentContent}
              />
            ) : (
              <XBRLViewer
                document={document}
                documentContent={documentContent}
              />
            )}
          </div>

          {/* 페이지 네비게이션 (PDF의 경우) */}
          {(document.type === 'DART_PDF' || document.type === 'SEC_IXBRL') && document.pageCount && (
            <div className="flex items-center justify-between p-4 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {currentPage} / {document.pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(document.pageCount || 1, p + 1))}
                disabled={currentPage >= (document.pageCount || 1)}
              >
                다음
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * PDF 뷰어 컴포넌트
 */
function PDFViewer({
  document,
  currentPage,
  onPageChange,
  documentContent
}: {
  document: SourceDocument;
  currentPage: number;
  onPageChange: (page: number) => void;
  documentContent?: string;
}) {
  // TODO: 실제 PDF.js 또는 다른 PDF 뷰어 통합
  // 현재는 플레이스홀더
  
  return (
    <div className="space-y-4">
      <div className="bg-muted/30 rounded-lg p-8 text-center border border-border/50">
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          PDF 뷰어 (PDF.js 통합 필요)
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          현재 페이지: {currentPage}
        </p>
        {document.url && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => window.open(document.url, '_blank')}
          >
            원본 문서 열기
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * XBRL 뷰어 컴포넌트
 */
function XBRLViewer({
  document,
  documentContent
}: {
  document: SourceDocument;
  documentContent?: string;
}) {
  // TODO: 실제 XBRL 뷰어 통합
  
  return (
    <div className="space-y-4">
      <div className="bg-muted/30 rounded-lg p-8 text-center border border-border/50">
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          XBRL 뷰어 (XBRL 파서 통합 필요)
        </p>
        {document.url && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => window.open(document.url, '_blank')}
          >
            원본 문서 열기
          </Button>
        )}
      </div>
    </div>
  )
}
