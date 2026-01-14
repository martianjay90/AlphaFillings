"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SourceViewer } from '@/components/source-viewer'
import { BriefingPanel } from '@/components/briefing-panel'
import type { BriefingResult } from '@/lib/valuation/briefing'
import type { SourceDocument, ReportSourceLink } from '@/lib/agents/librarian'
import { mapSentenceToSource } from '@/lib/agents/librarian'
import { cn } from '@/lib/utils/cn'
import { UI_TEXT } from '@/ui/labels/analysisSteps.ko'

interface ReportViewerProps {
  /** 브리핑 결과 */
  briefing: BriefingResult | null;
  
  /** 소스 문서 목록 */
  sourceDocuments: SourceDocument[];
  
  /** 로딩 여부 */
  isLoading?: boolean;
}

export function ReportViewer({
  briefing,
  sourceDocuments,
  isLoading
}: ReportViewerProps) {
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeLink, setActiveLink] = useState<ReportSourceLink | undefined>();
  const [currentDocument, setCurrentDocument] = useState<SourceDocument | undefined>();

  const handleSentenceClick = (sentence: string, sentenceId: string) => {
    if (sourceDocuments.length === 0) return;

    // 문장에서 소스 매핑
    const link = mapSentenceToSource(
      sentence,
      sentenceId,
      sourceDocuments
    );

    if (link) {
      setActiveLink(link);
      setCurrentDocument(link.sourceDocument);
      setIsViewerOpen(true);
    }
  };

  if (!briefing) {
    return (
      <Card className="glass-dark border-border/50">
        <CardHeader>
          <CardTitle>분석 리포트</CardTitle>
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
        {/* 왼쪽: 분석 리포트 */}
        <div className="space-y-6">
          <Card className="glass-dark border-border/50">
            <CardHeader>
              <CardTitle>분석 리포트</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {briefing.sections.map((section, index) => (
                <div
                  key={index}
                  className={cn(
                    "p-4 rounded-lg border",
                    section.warning
                      ? "bg-destructive/10 border-destructive/20"
                      : "bg-muted/30 border-border/50"
                  )}
                >
                  <h4 className="font-semibold mb-2">{section.title}</h4>
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    {section.content.split(/[.!?]\s+/).map((sentence, i) => {
                      const sentenceId = `sentence-${index}-${i}`;
                      const trimmedSentence = sentence.trim();
                      
                      if (!trimmedSentence) return null;
                      
                      return (
                        <span
                          key={i}
                          className={cn(
                            "cursor-pointer hover:text-primary transition-colors",
                            "underline decoration-dotted underline-offset-2"
                          )}
                          onClick={() => handleSentenceClick(trimmedSentence, sentenceId)}
                          title={UI_TEXT.viewOriginal}
                        >
                          {trimmedSentence}
                          {i < section.content.split(/[.!?]\s+/).length - 1 ? '. ' : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 브리핑 패널 */}
          <BriefingPanel briefing={briefing} isLoading={isLoading} />
        </div>

        {/* 오른쪽: 소스 뷰어 (데스크톱에서만 표시) */}
        <div className="hidden lg:block">
          <Card className="glass-dark border-border/50 sticky top-8">
            <CardHeader>
              <CardTitle>{UI_TEXT.evidenceSource}</CardTitle>
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
                        <span className="text-sm font-medium">{doc.title}</span>
                        <span className="text-xs text-muted-foreground">
                          ({doc.type})
                        </span>
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

      {/* 모바일/태블릿용 소스 뷰어 (사이드바) */}
      <SourceViewer
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        document={currentDocument}
        activeLink={activeLink}
      />
    </>
  );
}
