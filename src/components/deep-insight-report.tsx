"use client"

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, ExternalLink, AlertTriangle } from 'lucide-react'
import { SourceViewer } from '@/components/source-viewer'
import type { BriefingResult } from '@/lib/valuation/briefing'
import type { SourceDocument, ReportSourceLink } from '@/lib/agents/librarian'
import { createSmartLink } from '@/lib/agents/librarian'
import { cn } from '@/lib/utils/cn'
import { UI_TEXT } from '@/ui/labels/analysisSteps.ko'

interface DeepInsightReportProps {
  /** 브리핑 결과 */
  briefing: BriefingResult | null;
  
  /** 소스 문서 목록 */
  sourceDocuments: SourceDocument[];
  
  /** 로딩 여부 */
  isLoading?: boolean;
}

/**
 * 숫자 추출 (근거 버튼용)
 */
function extractNumbers(text: string): Array<{ value: string; index: number }> {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const numbers: Array<{ value: string; index: number }> = [];
  const patterns = [
    /\d+\.?\d*[%％]/g, // 퍼센트
    /\d{1,3}(?:,\d{3})+\s*(억|만|천)?\s*원/g, // 금액
    /\d+\.\d+/g, // 소수점
  ];
  
  try {
    for (const pattern of patterns) {
      // 매번 새로운 패턴 인스턴스를 사용하여 lastIndex 문제 방지
      const patternCopy = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = patternCopy.exec(text)) !== null) {
        if (match.index !== undefined && match[0]) {
          numbers.push({
            value: match[0],
            index: match.index,
          });
        }
        // 무한 루프 방지
        if (match.index === patternCopy.lastIndex) {
          patternCopy.lastIndex++;
        }
      }
    }
  } catch (error) {
    console.warn('[DeepInsightReport] 숫자 추출 실패:', error);
    return [];
  }
  
  return numbers;
}

export function DeepInsightReport({
  briefing,
  sourceDocuments,
  isLoading
}: DeepInsightReportProps) {
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeLink, setActiveLink] = useState<ReportSourceLink | undefined>();
  const [currentDocument, setCurrentDocument] = useState<SourceDocument | undefined>();

  // PDF 문서 찾기 (일반 사용자 기준: 근거 보기는 PDF로만 연결)
  // useMemo로 최적화 및 안전성 보장
  const pdfDoc = useMemo(() => {
    if (!sourceDocuments || !Array.isArray(sourceDocuments) || sourceDocuments.length === 0) {
      return undefined;
    }
    try {
      return sourceDocuments.find(
        (d) => d && (d.type === 'DART_PDF' || (d.url && typeof d.url === 'string' && d.url.toLowerCase().endsWith('.pdf')))
      );
    } catch (error) {
      console.warn('[DeepInsightReport] PDF 문서 찾기 실패:', error);
      return undefined;
    }
  }, [sourceDocuments]);

  const handleEvidenceClick = (
    sentence: string,
    sentenceId: string,
    pageNumber?: number
  ) => {
    // PDF가 없으면 아무 동작도 하지 않음
    if (!pdfDoc) return;

    const link = createSmartLink(
      sentenceId,
      sentence,
      pdfDoc,
      pageNumber,
      undefined,
      undefined,
      0.8
    );

    setActiveLink(link);
    setCurrentDocument(pdfDoc);
    setIsViewerOpen(true);
  };

  if (isLoading) {
    return (
      <Card className="glass-dark border-border/50">
        <CardHeader>
          <CardTitle>심층 분석 리포트</CardTitle>
          <CardDescription>{UI_TEXT.analyzing}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-4 bg-muted rounded w-5/6"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!briefing) {
    return (
      <Card className="glass-dark border-border/50">
        <CardHeader>
          <CardTitle>심층 분석 리포트</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {UI_TEXT.noDataAvailable}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 왼쪽: Deep Insight 리포트 */}
        <div className="space-y-6">
          <Card className="glass-dark border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    심층 분석 리포트
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {briefing.summary}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {briefing.sections.map((section, index) => (
                <div
                  key={index}
                  className={cn(
                    "p-4 rounded-lg border transition-all",
                    section.warning
                      ? "bg-destructive/10 border-destructive/20"
                      : "bg-muted/30 border-border/50"
                  )}
                >
                  <div className="flex items-start gap-2 mb-2">
                    {section.warning && (
                      <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    )}
                    <h4 className="font-semibold">{section.title}</h4>
                  </div>
                  
                  <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
                    {(() => {
                      const content = typeof section.content === 'string' ? section.content : String(section.content || '');
                      const sentences = content.split(/[.!?]\s+/);
                      
                      // "경영진 핵심 언어" 섹션은 근거 보기 버튼 없이 텍스트만 표시
                      const isKeyLanguageSection = section.title === '경영진 핵심 언어';
                      
                      return sentences.map((sentence, i) => {
                        const sentenceId = `sentence-${index}-${i}`;
                        const trimmedSentence = typeof sentence === 'string' ? sentence.trim() : String(sentence || '').trim();
                        
                        if (!trimmedSentence) return null;
                        
                        // "경영진 핵심 언어" 섹션은 근거 보기 없이 텍스트만 표시
                        if (isKeyLanguageSection) {
                          return (
                            <p key={i}>
                              {trimmedSentence}
                              {i < sentences.length - 1 ? '.' : ''}
                            </p>
                          );
                        }
                        
                        // 다른 섹션: 숫자가 있고 PDF 문서가 있을 때만 근거 보기 버튼 추가
                        const numbers = extractNumbers(trimmedSentence);
                        
                        if (numbers.length > 0 && pdfDoc) {
                          const parts: JSX.Element[] = [];
                          let lastIndex = 0;
                          
                          numbers.forEach((num, numIndex) => {
                            // 숫자 앞 텍스트
                            if (num.index > lastIndex) {
                              parts.push(
                                <span key={`text-${numIndex}`}>
                                  {trimmedSentence.substring(lastIndex, num.index)}
                                </span>
                              );
                            }
                            
                            // 숫자와 버튼
                            parts.push(
                              <span key={`num-${numIndex}`} className="inline-flex items-center gap-1">
                                <span className="font-medium text-foreground">{num.value}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-2 text-xs text-primary hover:text-primary/80"
                                  onClick={() => handleEvidenceClick(trimmedSentence, sentenceId)}
                                >
                                  [{UI_TEXT.evidenceButton}]
                                </Button>
                              </span>
                            );
                            
                            lastIndex = num.index + num.value.length;
                          });
                          
                          // 나머지 텍스트
                          if (lastIndex < trimmedSentence.length) {
                            parts.push(
                              <span key="text-end">
                                {trimmedSentence.substring(lastIndex)}
                              </span>
                            );
                          }
                          
                          return (
                            <p key={i} className="flex flex-wrap items-center gap-1">
                              {parts}
                              {i < sentences.length - 1 ? '.' : ''}
                            </p>
                          );
                        }
                        
                        // 숫자가 없으면 일반 텍스트
                        return (
                          <p key={i}>
                            {trimmedSentence}
                            {i < sentences.length - 1 ? '.' : ''}
                          </p>
                        );
                      });
                    })()}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* 오른쪽: Source Viewer */}
        <div className="hidden lg:block">
          <Card className="glass-dark border-border/50 sticky top-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ExternalLink className="h-5 w-5 text-primary" />
                {UI_TEXT.evidenceSource}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sourceDocuments.length > 0 ? (
                <div className="space-y-2">
                  {sourceDocuments.map((doc, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setCurrentDocument(doc);
                        setIsViewerOpen(true);
                      }}
                      className="w-full text-left p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{doc.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {doc.type === 'DART_PDF' ? 'DART PDF' : 
                             doc.type === 'SEC_IXBRL' ? 'SEC iXBRL' : 'DART XBRL'}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {UI_TEXT.noDataAvailable}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 모바일/태블릿용 소스 뷰어 */}
      <SourceViewer
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        document={currentDocument}
        activeLink={activeLink}
      />
    </>
  );
}
