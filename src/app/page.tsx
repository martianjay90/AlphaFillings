"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { FileDropzone, type UploadedFile } from '@/components/file-dropzone'
import { OfficialLinks } from '@/components/official-links'
import { FinancialCharts } from '@/components/financial-charts'
import { InsightCards } from '@/components/insight-cards'
import { KeyMetricsCard } from '@/components/key-metrics-card'
import { AnalysisStepWorkflow } from '@/components/analysis-step-workflow'
import { PixelRobot } from '@/components/pixel-robot'
import { FeatureCards } from '@/components/feature-cards'
import { UsageGuideSlider } from '@/components/usage-guide-slider'
import { LoadingAnimation } from '@/components/loading-animation'
import { DetailedProgress } from '@/components/detailed-progress'
import type { BriefingResult } from '@/lib/valuation/briefing'
import type { SourceDocument } from '@/lib/agents/librarian'
import { getFilePipeline, type DetailedProgressCallback } from '@/lib/parsers/file-pipeline'
import type { AnalysisBundle } from '@/types/analysis-bundle'
import { UI_TEXT } from '@/ui/labels/analysisSteps.ko'
import { DebugPanel } from '@/components/debug-panel'
import type { PipelineStage } from '@/lib/utils/progress-tracker'
import { STAGE_CONFIGS } from '@/lib/utils/progress-tracker'

export default function Home() {
  const [isLoading, setIsLoading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [briefing, setBriefing] = useState<BriefingResult | null>(null)
  const [sourceDocuments, setSourceDocuments] = useState<SourceDocument[]>([])
  const [progress, setProgress] = useState<{ stage: PipelineStage | string; percentage: number; message: string } | null>(null)
  const [detailedProgress, setDetailedProgress] = useState<DetailedProgressCallback | null>(null)
  const [parseResults, setParseResults] = useState<any[]>([])
  const [analysisBundle, setAnalysisBundle] = useState<AnalysisBundle | null>(null)
  const [industry, setIndustry] = useState<string>('tech')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false) // 중복 실행 방지용 상태
  const analysisRunIdRef = useRef<number>(0) // StrictMode 중복 실행 방지용 ref
  const hasAutoStartedRef = useRef<boolean>(false) // 자동 실행 여부 추적

  // 파일 첨부: File 객체만 저장 (자동 분석은 useEffect에서 처리)
  const handleFilesUploaded = (files: UploadedFile[]) => {
    setUploadedFiles(files)
    setBriefing(null)
    setSourceDocuments([])
    setAnalysisBundle(null)
    setParseResults([])
    setProgress(null)
    setDetailedProgress(null)
    setErrorMessage(null)
    setIsLoading(false)
    setIsAnalyzing(false)
    hasAutoStartedRef.current = false // 자동 실행 플래그 초기화
    // runId는 startAnalysis 내부에서 생성됨
  }

  // 분석 실행: 단일 파이프라인 (0~100%) - 재분석 용도로도 사용
  const startAnalysis = useCallback(async () => {
    // PDF와 XBRL이 모두 업로드되어야 함 (안전장치)
    const hasPdf = uploadedFiles.some(f => f.type === 'pdf')
    const hasXbrl = uploadedFiles.some(f => f.type === 'xbrl')
    if (!hasPdf || !hasXbrl || isAnalyzing) {
      return // 조용히 종료 (에러 메시지 없음)
    }

    // StrictMode 중복 실행 방지: runId 확인
    const currentRunId = Date.now()
    analysisRunIdRef.current = currentRunId

    // 중복 실행 방지
    setIsAnalyzing(true)

    // 상태 초기화 (재분석인 경우 결과 초기화)
    setIsLoading(true)
    setBriefing(null)
    setSourceDocuments([])
    setAnalysisBundle(null)
    setParseResults([])
    setProgress({ stage: 'FILES_READING', percentage: 0, message: '파일 읽는 중...' })
    setDetailedProgress(null)
    setErrorMessage(null)

    try {
      // runId 변경 확인 (새로운 분석이 시작되었는지)
      if (analysisRunIdRef.current !== currentRunId) {
        console.warn('[startAnalysis] 새로운 분석이 시작되어 현재 실행을 중단합니다.')
        return
      }

      const pipeline = getFilePipeline()
      
      const pipelineResult = await pipeline.analyzeFiles(
        uploadedFiles,
        industry,
        'KR',
        (progressUpdate) => {
          // runId 변경 확인 (중간에 새 분석이 시작되었는지)
          if (analysisRunIdRef.current !== currentRunId) {
            console.warn('[startAnalysis] 진행 중 새로운 분석이 시작되어 중단합니다.')
            return
          }

          const stage = progressUpdate.stage as PipelineStage
          const percentage = Math.round(progressUpdate.percentage)
          
          console.log(`[startAnalysis] 진행률: ${percentage}% - ${progressUpdate.message} (단계: ${stage})`)
          
          // 사용자 친화적인 단계 레이블 매핑
          let displayMessage = progressUpdate.message || STAGE_CONFIGS[stage]?.label || '처리 중...'
          
          // 단계별 레이블 개선 (요구사항에 맞게)
          if (stage === 'FILES_READING' || stage === 'ZIP_EXTRACT') {
            displayMessage = '파일 읽는 중'
          } else if (stage === 'XBRL_PARSE' || stage === 'PDF_PARSE') {
            displayMessage = '재무 데이터 정리 중'
          } else if (stage === 'BUILD_ANALYSIS') {
            displayMessage = '리포트 생성 중'
          } else if (stage === 'DONE') {
            displayMessage = '분석 완료'
          }
          
          setProgress({ 
            stage, 
            percentage, 
            message: displayMessage
          })
        },
        (detailedProgress) => {
          // runId 변경 확인
          if (analysisRunIdRef.current !== currentRunId) {
            return
          }
          setDetailedProgress({ ...detailedProgress })
        }
      )

      // runId 변경 확인 (결과 저장 전)
      if (analysisRunIdRef.current !== currentRunId) {
        console.warn('[startAnalysis] 실행이 취소되었습니다.')
        return
      }

      if (!pipelineResult.success) {
        throw new Error(pipelineResult.error || '분석 실패')
      }

      if (!pipelineResult.briefing) {
        throw new Error('브리핑 생성 실패')
      }

      // 소스 문서 생성
      const sourceDocs: SourceDocument[] = uploadedFiles.map((file) => ({
        type: file.type === 'pdf' ? 'DART_PDF' as const : 'DART_XBRL' as const,
        url: URL.createObjectURL(file.file),
        title: file.file.name,
        pageCount: file.type === 'pdf' ? 50 : 0,
      }))

      // 결과 저장
      setBriefing(pipelineResult.briefing)
      setSourceDocuments(sourceDocs)
      setParseResults(pipelineResult.parseResults)
      setAnalysisBundle(pipelineResult.analysisBundle || null)
      setDetailedProgress(null)
      setProgress({ stage: 'DONE', percentage: 100, message: STAGE_CONFIGS.DONE.label })

      // AnalysisBundle 로깅 (개발 환경)
      if (pipelineResult.analysisBundle && typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log('[Page] AnalysisBundle 저장 완료:', JSON.stringify(pipelineResult.analysisBundle, null, 2))
      }

      // 정렬된 재무제표 저장 (가변적 분석용)
      if (pipelineResult.parseResults) {
        const sortedStatements = pipelineResult.parseResults
          .filter(r => r.financialStatement)
          .map(r => r.financialStatement!)
          .sort((a, b) => {
            if (a.fiscalYear !== b.fiscalYear) {
              return (a.fiscalYear || 0) - (b.fiscalYear || 0)
            }
            return (a.quarter || 0) - (b.quarter || 0)
          })
        // parseResults에 정렬된 상태 반영
        pipelineResult.parseResults.forEach((r, i) => {
          if (r.financialStatement && sortedStatements[i]) {
            r.financialStatement = sortedStatements[i]
          }
        })
      }
    } catch (error) {
      console.error('[startAnalysis] 분석 오류:', error)

      // runId 변경 확인 (에러 처리 전)
      if (analysisRunIdRef.current !== currentRunId) {
        console.warn('[startAnalysis] 실행이 취소되었습니다.')
        return
      }

      // 사용자 친화적인 에러 메시지
      let userFriendlyError = '분석 중 오류가 발생했습니다.'
      if (error instanceof Error) {
        // 기술적인 에러 메시지는 사용자에게 노출하지 않음
        if (error.message.includes('타임아웃')) {
          userFriendlyError = '분석 시간이 초과되었습니다. 다시 시도해주세요.'
        } else if (error.message.includes('파싱 실패') || error.message.includes('태그를 찾을 수 없습니다')) {
          userFriendlyError = '파일 형식이 올바르지 않거나 필요한 데이터가 누락되었습니다.'
        } else if (error.message.includes('필수 항목이 누락되었습니다')) {
          userFriendlyError = '재무제표 필수 항목이 누락되었습니다. 다른 파일을 업로드해주세요.'
        }
      }
      
      setErrorMessage(userFriendlyError)
      setProgress({ stage: 'ERROR', percentage: 0, message: userFriendlyError })
      setDetailedProgress(null)
    } finally {
      // runId가 변경되지 않았을 때만 상태 해제
      if (analysisRunIdRef.current === currentRunId) {
        setIsAnalyzing(false)
        setIsLoading(false)
      }
    }
  }, [uploadedFiles, industry]) // 의존성: uploadedFiles, industry

  // 분석 준비 상태 계산 (PDF와 XBRL 모두 업로드되어야 함)
  const isReadyToAnalyze = useMemo(() => {
    const hasPdf = uploadedFiles.some(f => f.type === 'pdf')
    const hasXbrl = uploadedFiles.some(f => f.type === 'xbrl')
    return hasPdf && hasXbrl
  }, [uploadedFiles])

  // 파일 업로드 후 자동 분석 시작 (useEffect로 분리하여 StrictMode 중복 실행 방지)
  useEffect(() => {
    // PDF와 XBRL이 모두 있고, 아직 자동 시작하지 않았고, 분석 중이 아니고, 결과가 없을 때만 실행
    if (isReadyToAnalyze && !hasAutoStartedRef.current && !isAnalyzing && !briefing) {
      hasAutoStartedRef.current = true
      
      // 약간의 지연을 두어 상태 업데이트 완료 보장 (StrictMode에서 두 번 호출되는 것 방지)
      const timer = setTimeout(() => {
        // 타이머 실행 시점에 다시 한 번 확인 (StrictMode로 인해 두 번 호출될 수 있음)
        if (hasAutoStartedRef.current && !isAnalyzing && !briefing) {
          startAnalysis()
        }
      }, 150)
      
      return () => {
        clearTimeout(timer)
        // cleanup에서 hasAutoStartedRef를 리셋하지 않음 (실제 실행은 startAnalysis 내부의 runId로 보호됨)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadyToAnalyze]) // isReadyToAnalyze를 의존성으로 사용 (startAnalysis는 useCallback으로 안정화됨)


  // PDF 인사이트 추출
  const pdfInsights = parseResults
    .filter(r => r.pdfResult)
    .flatMap(r => r.pdfResult!)

  const accountingContradictions = pdfInsights.flatMap(p => p.accountingContradictions || [])

  // 재무제표 데이터 추출
  const financialStatement = parseResults
    .find(r => r.financialStatement)?.financialStatement

  return (
    <main className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="border-b border-border/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link 
              href="/" 
              className="hover:opacity-80 transition-opacity"
              onClick={(e) => {
                // 모든 상태값 초기화
                setUploadedFiles([])
                setBriefing(null)
                setParseResults([])
                setSourceDocuments([])
                setAnalysisBundle(null)
                setProgress(null)
                setDetailedProgress(null)
                setIsLoading(false)
                setErrorMessage(null)
                setIsAnalyzing(false)
                hasAutoStartedRef.current = false // 자동 실행 플래그 초기화
                analysisRunIdRef.current = 0 // runId 초기화
              }}
            >
              <h1 className="text-2xl font-bold tracking-tight">Sync Value AI</h1>
              <p className="text-xs text-muted-foreground mt-0.5">AI 기반 기업 가치 평가 플랫폼</p>
            </Link>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <div className="container mx-auto px-4 py-12">
        {!isReadyToAnalyze && !briefing ? (
          /* 파일 드롭존 화면 */
          <div className="flex flex-col items-center justify-center w-full">
            <div className="w-full max-w-3xl mb-16">
              <div className="mb-8 text-center">
                <div className="flex flex-col items-center justify-center mb-6">
                  <PixelRobot size="lg" />
                </div>
                <p className="text-muted-foreground text-lg">
                  분기/사업 보고서 파일을 업로드하여 분석하세요
                </p>
              </div>
              
              {/* 파일 업로드 체크리스트 */}
              {uploadedFiles.length > 0 && (
                <div className="mb-6 flex flex-col gap-2 items-center">
                  <div className={`flex items-center gap-2 ${uploadedFiles.some(f => f.type === 'pdf') ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {uploadedFiles.some(f => f.type === 'pdf') ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <div className="h-5 w-5 rounded border-2 border-current" />
                    )}
                    <span className="text-sm">PDF 업로드 완료</span>
                  </div>
                  <div className={`flex items-center gap-2 ${uploadedFiles.some(f => f.type === 'xbrl') ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {uploadedFiles.some(f => f.type === 'xbrl') ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <div className="h-5 w-5 rounded border-2 border-current" />
                    )}
                    <span className="text-sm">XBRL(ZIP) 업로드 완료</span>
                  </div>
                </div>
              )}
              
              {/* 파일 드롭존 */}
              <FileDropzone 
                onFilesUploaded={handleFilesUploaded}
                maxFiles={10}
              />
              
              {/* 공식 링크 */}
              <OfficialLinks />
            </div>

            {/* 하단 카드 섹션 */}
            <div className="w-full max-w-7xl mt-24">
              {/* 사용 가이드 슬라이더 */}
              <div className="mb-12">
                <UsageGuideSlider />
              </div>

              {/* 기능 카드 */}
              <FeatureCards />
            </div>
          </div>
        ) : (
          /* 분석 화면 */
          <div className="max-w-7xl mx-auto space-y-6">
            {/* 상세 진행 상태 (파일별 진행 추적) */}
            {isLoading && detailedProgress && (
              <DetailedProgress
                currentMessage={detailedProgress.message}
                percentage={detailedProgress.percentage}
                fileStatuses={detailedProgress.fileStatuses}
                missingYears={detailedProgress.missingYears}
                dataWarning={detailedProgress.dataWarning}
              />
            )}

            {/* 로딩 애니메이션 (상세 진행 상태가 없을 때) */}
            {isLoading && progress && !detailedProgress && (
              <LoadingAnimation 
                message={progress.message}
                percentage={progress.percentage}
              />
            )}

            {/* 에러 메시지 표시 */}
            {errorMessage && progress?.stage === 'ERROR' && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-destructive">오류 발생</span>
                </div>
                <p className="text-sm text-destructive">{errorMessage}</p>
              </div>
            )}

            {/* 차트 및 인사이트 */}
            {briefing && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="space-y-6"
              >
                {/* 가변적 분석: 파일 개수에 따라 다른 UI 표시 */}
                {financialStatement && (
                  <>
                    {/* 1개 파일일 경우: 핵심 지표 요약 카드 */}
                    {parseResults.filter(r => r.financialStatement).length === 1 && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-xl font-semibold">핵심 지표 요약</h3>
                          {/* 기준 기간 표시 */}
                          {analysisBundle?.period && (
                            <p className="text-sm text-muted-foreground mt-1">
                              기준 기간:{' '}
                              {analysisBundle.period.startDate && analysisBundle.period.endDate
                                ? `${analysisBundle.period.startDate} ~ ${analysisBundle.period.endDate}${analysisBundle.periodLabel ? ` (${analysisBundle.periodLabel})` : ''}`
                                : analysisBundle.period.endDate
                                ? `~ ${analysisBundle.period.endDate}${analysisBundle.periodLabel ? ` (${analysisBundle.periodLabel})` : ''}`
                                : ''}
                            </p>
                          )}
                        </div>
                        <KeyMetricsCard 
                          financialStatement={financialStatement} 
                          analysisBundle={analysisBundle}
                        />
                      </div>
                    )}

                    {/* Step 워크플로우 */}
                    {analysisBundle && analysisBundle.stepOutputs && analysisBundle.stepOutputs.length > 0 && (
                      <div className="mt-8">
                        <AnalysisStepWorkflow analysisBundle={analysisBundle} />
                      </div>
                    )}

                    {/* 2개 이상일 경우: 재무 추이 차트 */}
                    {parseResults.filter(r => r.financialStatement).length >= 2 && (
                      <FinancialCharts 
                        financialStatement={financialStatement}
                        financialStatements={parseResults
                          .filter(r => r.financialStatement)
                          .map(r => r.financialStatement!)
                          .sort((a, b) => {
                            // 시계열 순서로 정렬
                            if (a.fiscalYear !== b.fiscalYear) {
                              return (a.fiscalYear || 0) - (b.fiscalYear || 0)
                            }
                            return (a.quarter || 0) - (b.quarter || 0)
                          })
                        }
                      />
                    )}
                  </>
                )}

                {/* 인사이트 카드 */}
                {accountingContradictions.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <InsightCards
                      title="회계적 모순점"
                      items={accountingContradictions.slice(0, 5)}
                      type="contradictions"
                    />
                  </div>
                )}

              </motion.div>
            )}
          </div>
        )}
      </div>
      
      {/* 디버그 패널 (개발 모드) */}
      {progress && (
        <DebugPanel
          currentStage={progress.stage as PipelineStage}
          percentage={progress.percentage}
          lastMessage={progress.message}
          lastFile={undefined}
        />
      )}
    </main>
  )
}
