"use client"

import type { AnalysisBundle, StepOutput } from '@/types/analysis-bundle'
import { buildStep1ReportText } from '@/lib/analysis/industry/step1-report-text'

interface Step01SlideProps {
  bundle: AnalysisBundle
  step: StepOutput
}

export function Step01Slide({ bundle, step }: Step01SlideProps) {
  const reportText = buildStep1ReportText(step, bundle.company.industry)
  
  return (
    <div className="p-6">
      <pre className="whitespace-pre-wrap leading-relaxed font-mono text-sm">
        {reportText}
      </pre>
    </div>
  )
}
