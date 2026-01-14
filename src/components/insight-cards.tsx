"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, TrendingUp, FileText } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface InsightCardProps {
  title: string
  items: string[]
  type: 'key-language' | 'contradictions'
  className?: string
}

export function InsightCards({ title, items, type, className }: InsightCardProps) {
  if (items.length === 0) return null

  return (
    <Card className={cn("glass-dark border-border/50", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {type === 'key-language' ? (
            <TrendingUp className="h-5 w-5 text-primary" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          )}
          {title}
        </CardTitle>
        <CardDescription>
          {type === 'key-language' 
            ? '경영진의 핵심 언어 및 주요 메시지'
            : '회계적 모순점 및 주의사항'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={index}
              className={cn(
                "p-3 rounded-lg border text-sm",
                type === 'key-language'
                  ? "bg-primary/5 border-primary/20"
                  : "bg-destructive/5 border-destructive/20"
              )}
            >
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-muted-foreground leading-relaxed">{item}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
