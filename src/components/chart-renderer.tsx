/**
 * Chart Renderer
 * ChartPlan을 기반으로 차트를 렌더링
 * ChartPlan에 없는 차트는 렌더 금지 + "데이터 부족(추정 없음)" 카드 표시
 */

"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ChartPlan, ChartPlanItem, AnalysisBundle } from '@/types/analysis-bundle'
import { UI_TEXT } from '@/ui/labels/analysisSteps.ko'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface ChartRendererProps {
  /** ChartPlan */
  chartPlan: ChartPlan
  
  /** AnalysisBundle (데이터 소스) */
  bundle: AnalysisBundle
  
  /** 클래스명 */
  className?: string
}

/**
 * 차트 렌더링
 */
export function ChartRenderer({ chartPlan, bundle, className }: ChartRendererProps) {
  if (!chartPlan || chartPlan.charts.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>차트</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>{UI_TEXT.chartDataInsufficient}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={className}>
      {chartPlan.charts.map((chart) => (
        <ChartItem
          key={chart.chartId}
          chart={chart}
          bundle={bundle}
        />
      ))}
    </div>
  )
}

/**
 * 개별 차트 항목
 */
function ChartItem({ chart, bundle }: { chart: ChartPlanItem; bundle: AnalysisBundle }) {
  if (!chart.available) {
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg">{chart.periodLabel}</CardTitle>
          <CardDescription>{chart.chartType} 차트</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>데이터 부족 (추정 없음)</span>
            </div>
            {chart.reason && (
              <p className="text-xs text-muted-foreground">{chart.reason}</p>
            )}
            {chart.requiredReports && (
              <div className="mt-2 p-2 bg-muted/30 rounded-lg">
                <p className="text-xs font-medium mb-1">추가로 필요한 보고서:</p>
                <p className="text-xs text-muted-foreground">{chart.requiredReports}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // 실제 차트 렌더링 (간단한 예시)
  // TODO: 실제 차트 라이브러리(Recharts 등)로 구현
  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{chart.periodLabel}</CardTitle>
            <CardDescription>{chart.chartType} 차트</CardDescription>
          </div>
          {chart.badge && (
            <span className={cn(
              "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium",
              "bg-muted text-muted-foreground"
            )}>
              {chart.badge}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 flex items-center justify-center bg-muted/30 rounded-lg">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium">{chart.chartType.toUpperCase()} 차트</p>
            <p className="text-xs text-muted-foreground">
              데이터 키: {chart.dataKeys.join(', ')}
            </p>
            <p className="text-xs text-muted-foreground">
              (실제 차트 렌더링은 추후 구현)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
