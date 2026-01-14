"use client"

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AnalysisBundle } from '@/types/analysis-bundle'
import { STEP_TITLES, STEP_DESCRIPTIONS } from '@/ui/labels/analysisSteps.ko'
import { Step01Slide } from '@/components/steps/step01-slide'

interface AnalysisStepWorkflowProps {
  analysisBundle: AnalysisBundle
}

export function AnalysisStepWorkflow({ analysisBundle }: AnalysisStepWorkflowProps) {
  const [selectedStep, setSelectedStep] = useState<number>(1)

  // stepOutputs를 step 오름차순으로 정렬
  const sortedSteps = useMemo(() => {
    if (!analysisBundle.stepOutputs || analysisBundle.stepOutputs.length === 0) {
      return []
    }
    return [...analysisBundle.stepOutputs].sort((a, b) => a.step - b.step)
  }, [analysisBundle.stepOutputs])

  // 현재 선택된 Step 데이터
  const currentStepData = useMemo(() => {
    return sortedSteps.find(s => s.step === selectedStep)
  }, [sortedSteps, selectedStep])

  // Step 제목과 설명 가져오기
  const stepTitle = STEP_TITLES[selectedStep as keyof typeof STEP_TITLES] || `Step ${selectedStep}`
  const stepDescription = STEP_DESCRIPTIONS[selectedStep as keyof typeof STEP_DESCRIPTIONS] || ''

  // 이전/다음 Step 이동
  const handlePrev = () => {
    if (selectedStep > 1) {
      setSelectedStep(selectedStep - 1)
    }
  }

  const handleNext = () => {
    if (selectedStep < 11) {
      setSelectedStep(selectedStep + 1)
    }
  }

  // Step 내비게이션 클릭
  const handleStepClick = (step: number) => {
    setSelectedStep(step)
  }

  // 진행률 계산 (1-11)
  const progressPercentage = (selectedStep / 11) * 100

  if (sortedSteps.length === 0) {
    return null
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* 상단: Step 정보 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Step {selectedStep}/11</h2>
            <h3 className="text-xl font-semibold mt-1">{stepTitle}</h3>
          </div>
        </div>
        <p className="text-muted-foreground">{stepDescription}</p>
      </div>

      {/* Step 내비게이션 (가로) */}
      <div className="border-b border-border">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {Array.from({ length: 11 }, (_, i) => i + 1).map((step) => {
            const stepData = sortedSteps.find(s => s.step === step)
            const isActive = step === selectedStep
            const stepTitleShort = STEP_TITLES[step as keyof typeof STEP_TITLES] || `Step ${step}`
            
            return (
              <button
                key={step}
                onClick={() => handleStepClick(step)}
                className={`
                  px-4 py-2 rounded-t-lg text-sm font-medium whitespace-nowrap
                  transition-colors
                  ${isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }
                  ${!stepData ? 'opacity-50' : ''}
                `}
                disabled={!stepData}
              >
                {step}. {stepTitleShort}
              </button>
            )
          })}
        </div>
      </div>

      {/* 본문: Step 내용 */}
      <div className="min-h-[400px] border border-border rounded-lg p-6 bg-card">
        {currentStepData ? (
          <div className="space-y-6">
            {/* Step1은 전용 컴포넌트 */}
            {selectedStep === 1 ? (
              <Step01Slide bundle={analysisBundle} step={currentStepData} />
            ) : (
              /* Step 2-11: summaryCards, findings, checkpoints 표시 */
              <div className="space-y-6">
                {/* 요약 카드 */}
                {currentStepData.summaryCards && currentStepData.summaryCards.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold mb-4">요약 카드</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {currentStepData.summaryCards.map((card, idx) => (
                        <div key={idx} className="border border-border rounded-lg p-4 bg-muted/50">
                          <div className="text-sm font-medium text-muted-foreground">{card.label}</div>
                          {card.value && (
                            <div className="text-lg font-semibold mt-1">{card.value}</div>
                          )}
                          {card.note && (
                            <div className="text-xs text-muted-foreground mt-1">{card.note}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 발견 사항 */}
                {currentStepData.findings && currentStepData.findings.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold mb-4">발견 사항</h4>
                    <div className="space-y-3">
                      {currentStepData.findings.map((finding) => {
                        const severityColors = {
                          info: 'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300',
                          warn: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700 dark:text-yellow-300',
                          risk: 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300',
                        }
                        return (
                          <div
                            key={finding.id}
                            className={`border rounded-lg p-4 ${severityColors[finding.severity] || severityColors.info}`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xs font-medium px-2 py-1 rounded bg-background/50">
                                    {finding.severity === 'info' ? '정보' : finding.severity === 'warn' ? '주의' : '위험'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {finding.category}
                                  </span>
                                </div>
                                <p className="text-sm">{finding.text}</p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 체크포인트 */}
                {currentStepData.checkpoints && currentStepData.checkpoints.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold mb-4">체크포인트</h4>
                    <div className="space-y-4">
                      {currentStepData.checkpoints.map((checkpoint) => (
                        <div key={checkpoint.id} className="border border-border rounded-lg p-4 bg-muted/30">
                          <h5 className="font-semibold mb-3">{checkpoint.title}</h5>
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="font-medium text-muted-foreground">주시할 항목: </span>
                              <span>{checkpoint.whatToWatch}</span>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">중요성: </span>
                              <span>{checkpoint.whyItMatters}</span>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">다음 분기 조치: </span>
                              <span>{checkpoint.nextQuarterAction}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 데이터가 없는 경우 */}
                {(!currentStepData.summaryCards || currentStepData.summaryCards.length === 0) &&
                 (!currentStepData.findings || currentStepData.findings.length === 0) &&
                 (!currentStepData.checkpoints || currentStepData.checkpoints.length === 0) && (
                  <p className="text-muted-foreground text-center py-8">Step {selectedStep}의 내용이 아직 준비되지 않았습니다.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Step {selectedStep}의 데이터가 없습니다.
          </div>
        )}
      </div>

      {/* 하단: 이전/다음 버튼 및 진행바 */}
      <div className="space-y-4">
        {/* 진행바 */}
        <div className="w-full">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>진행률</span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          {/* Step 마커 (11등분) */}
          <div className="flex justify-between mt-1">
            {Array.from({ length: 11 }, (_, i) => i + 1).map((step) => (
              <div
                key={step}
                className={`w-1 h-1 rounded-full ${
                  step <= selectedStep ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 이전/다음 버튼 */}
        <div className="flex justify-between">
          <button
            onClick={handlePrev}
            disabled={selectedStep === 1}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium
              transition-colors
              ${selectedStep === 1
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }
            `}
          >
            <ChevronLeft className="h-4 w-4" />
            이전
          </button>

          <button
            onClick={handleNext}
            disabled={selectedStep === 11}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium
              transition-colors
              ${selectedStep === 11
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }
            `}
          >
            다음
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
