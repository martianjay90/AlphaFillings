"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { EvidenceRef } from '@/types/analysis-bundle'
import type { SourceDocument } from '@/lib/agents/librarian'

interface SummaryCardProps {
  /** 카드 레이블 */
  label: string
  
  /** 카드 값 */
  value?: string
  
  /** 참고 사항 */
  note?: string
  
  /** 근거 참조 배열 */
  evidence?: EvidenceRef[]
  
  /** 소스 문서 배열 */
  sourceDocuments?: SourceDocument[]
  
  /** 근거 클릭 핸들러 */
  onEvidenceClick?: (fileId: string, pageNumber?: number) => void
  
  /** className */
  className?: string
}

/**
 * 요약 카드 컴포넌트
 * summaryCards 배열에서 사용
 */
export function SummaryCard({
  label,
  value,
  note,
  evidence,
  sourceDocuments = [],
  onEvidenceClick,
  className = '',
}: SummaryCardProps) {
  return (
    <Card className={`glass-dark border-border/50 ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          <span>{label}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {value && (
            <p className="text-2xl font-bold">{value}</p>
          )}
          {note && (
            <p className="text-xs text-muted-foreground">{note}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
