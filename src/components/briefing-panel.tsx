"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import type { BriefingResult } from '@/lib/valuation/briefing'
import { cn } from '@/lib/utils/cn'

interface BriefingPanelProps {
  briefing: BriefingResult | null
  isLoading?: boolean
}

export function BriefingPanel({ briefing, isLoading }: BriefingPanelProps) {
  if (isLoading) {
    return (
      <Card className="glass-dark border-border/50">
        <CardHeader>
          <CardTitle>분석 브리핑</CardTitle>
          <CardDescription>분석 중...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-4 bg-muted rounded w-5/6"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!briefing) {
    return (
      <Card className="glass-dark border-border/50">
        <CardHeader>
          <CardTitle>분석 브리핑</CardTitle>
          <CardDescription>분석 결과가 없습니다.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="glass-dark border-border/50">
      <CardHeader>
        <CardTitle>분석 브리핑</CardTitle>
        <CardDescription>{briefing.summary}</CardDescription>
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
            <div className="flex items-start gap-3">
              {section.warning ? (
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              ) : section.priority === 'high' ? (
                <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h4 className="font-semibold mb-1">{section.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {section.content}
                </p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
