/**
 * The Librarian 에이전트
 * 인터랙티브 소스 뷰어 및 Smart-Link 관리
 */

import type { FinancialStatement } from '@/types/financial';

/**
 * 소스 문서 타입
 */
export type SourceDocumentType = 'DART_PDF' | 'SEC_IXBRL' | 'DART_XBRL';

/**
 * 소스 문서 정보
 */
export interface SourceDocument {
  /** 문서 타입 */
  type: SourceDocumentType;
  
  /** 문서 URL 또는 경로 */
  url: string;
  
  /** 문서 제목 */
  title: string;
  
  /** 페이지 수 (PDF의 경우) */
  pageCount?: number;
  
  /** 섹션 맵 (페이지 번호 -> 섹션 제목) */
  sectionMap?: Map<number, string>;
}

/**
 * 리포트 문장과 소스 문서의 링크
 */
export interface ReportSourceLink {
  /** 리포트 문장 ID */
  sentenceId: string;
  
  /** 리포트 문장 텍스트 */
  sentenceText: string;
  
  /** 연결된 소스 문서 */
  sourceDocument: SourceDocument;
  
  /** 타겟 페이지 번호 (PDF의 경우) */
  targetPage?: number;
  
  /** 타겟 섹션 제목 */
  targetSection?: string;
  
  /** 타겟 요소 ID (iXBRL의 경우) */
  targetElementId?: string;
  
  /** 신뢰도 (0-1) */
  confidence: number;
}

/**
 * 뷰어 상태
 */
export interface ViewerState {
  /** 뷰어 열림 여부 */
  isOpen: boolean;
  
  /** 현재 표시 중인 문서 */
  currentDocument?: SourceDocument;
  
  /** 현재 페이지 (PDF의 경우) */
  currentPage?: number;
  
  /** 하이라이트된 요소 ID (iXBRL의 경우) */
  highlightedElementId?: string;
  
  /** 활성 링크 */
  activeLink?: ReportSourceLink;
}

/**
 * Smart-Link 생성
 * 리포트 문장에서 소스 문서로의 링크 생성
 */
export function createSmartLink(
  sentenceId: string,
  sentenceText: string,
  sourceDocument: SourceDocument,
  targetPage?: number,
  targetSection?: string,
  targetElementId?: string,
  confidence: number = 0.8
): ReportSourceLink {
  return {
    sentenceId,
    sentenceText,
    sourceDocument,
    targetPage,
    targetSection,
    targetElementId,
    confidence
  };
}

/**
 * 리포트 문장에서 키워드 추출 및 소스 매핑
 */
export function mapSentenceToSource(
  sentenceText: string,
  sentenceId: string,
  sourceDocuments: SourceDocument[],
  keywordMappings?: Map<string, { page?: number; section?: string; elementId?: string }>
): ReportSourceLink | null {
  // 키워드 기반 매핑
  if (keywordMappings) {
    for (const [keyword, location] of keywordMappings.entries()) {
      if (sentenceText.includes(keyword)) {
        const doc = sourceDocuments[0]; // 기본 문서 사용
        if (doc) {
          return createSmartLink(
            sentenceId,
            sentenceText,
            doc,
            location.page,
            location.section,
            location.elementId,
            0.7
          );
        }
      }
    }
  }
  
  // 기본 매핑 (첫 번째 문서의 첫 페이지)
  if (sourceDocuments.length > 0) {
    return createSmartLink(
      sentenceId,
      sentenceText,
      sourceDocuments[0],
      1,
      undefined,
      undefined,
      0.5
    );
  }
  
  return null;
}

/**
 * 페이지로 스크롤 (PDF 뷰어용)
 */
export function scrollToPage(
  pageNumber: number,
  viewerElement?: HTMLElement
): void {
  if (viewerElement) {
    // PDF.js 또는 다른 PDF 뷰어와 통합 필요
    // 현재는 이벤트만 발생시킴
    const event = new CustomEvent('scrollToPage', {
      detail: { pageNumber }
    });
    viewerElement.dispatchEvent(event);
  }
}

/**
 * 요소 하이라이트 (iXBRL 뷰어용)
 */
export function highlightElement(
  elementId: string,
  viewerElement?: HTMLElement
): void {
  if (viewerElement) {
    const element = viewerElement.querySelector(`[data-element-id="${elementId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 하이라이트 효과 추가
      element.classList.add('highlighted');
      setTimeout(() => {
        element.classList.remove('highlighted');
      }, 3000);
    }
  }
}

/**
 * Smart-Link 클릭 핸들러
 */
export function handleSmartLinkClick(
  link: ReportSourceLink,
  viewerElement?: HTMLElement
): void {
  if (link.targetPage) {
    scrollToPage(link.targetPage, viewerElement);
  } else if (link.targetElementId) {
    highlightElement(link.targetElementId, viewerElement);
  }
}
