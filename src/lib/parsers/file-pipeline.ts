/**
 * 파일 기반 분석 파이프라인
 * 업로드된 파일을 병렬로 파싱하고 분석
 */

import { parseUploadedFiles, type FileParseResult, type FileParseStatus } from './file-parser'
import type { UploadedFile } from '@/components/file-dropzone'
import type { CountryCode } from '@/types/industry'
import { generateBriefing } from '@/lib/valuation/briefing'
import type { BriefingResult } from '@/lib/valuation/briefing'
import { extractYearFromFileName, extractReportType } from '@/lib/utils/file-utils'
import { extractFinancialTablesFromPDF } from './pdf-fallback-extractor'
import { mapFilesToMetadata, detectMissingYears, type FileMetadata } from '@/lib/utils/file-mapper'
import { mergeFinancialStatementsToHistory, historyToFinancialStatements, type FinancialHistory } from './timeseries-merger'
import type { FinancialStatement } from '@/types/financial'
import { buildAnalysisBundle } from '@/lib/analysis/analysis-bundle-builder'
import type { AnalysisBundle, IndustryClassification } from '@/types/analysis-bundle'
import { classifyIndustryFromPDF, classifyIndustryFromMetadata } from '@/lib/analysis/classification/industry-classifier'
import { UI_TEXT } from '@/ui/labels/analysisSteps.ko'
import {
  type PipelineStage,
  type StageProgress,
  STAGE_CONFIGS,
  tick,
  withTimeout,
  calculateStageProgress,
  logStageTransition,
} from '@/lib/utils/progress-tracker'

/**
 * 파일 파이프라인 결과
 */
export interface FilePipelineResult {
  /** 성공 여부 */
  success: boolean
  
  /** 파싱 결과 */
  parseResults: FileParseResult[]
  
  /** 브리핑 결과 (레거시 호환용) */
  briefing?: BriefingResult
  
  /** 정렬된 재무제표 배열 (시계열 순, 레거시 호환용) */
  sortedFinancialStatements?: FinancialStatement[]
  
  /** AnalysisBundle (레벨2 동등성 계약 준수) */
  analysisBundle?: AnalysisBundle
  
  /** 파일 개수 */
  fileCount?: number
  
  /** 에러 메시지 */
  error?: string
}

/**
 * 상세 진행 상태 콜백
 */
export interface DetailedProgressCallback {
  /** 전체 진행률 (0-100) */
  percentage: number
  
  /** 현재 작업 메시지 */
  message: string
  
  /** 파일별 진행 상태 */
  fileStatuses: FileParseStatus[]
  
  /** 누락된 연도 목록 */
  missingYears?: number[]
  
  /** 데이터 부족 경고 메시지 */
  dataWarning?: string
}

/**
 * 파일 기반 분석 파이프라인
 */
export class FilePipeline {
  /**
   * 업로드된 파일들을 분석
   */
  async analyzeFiles(
    files: UploadedFile[],
    industry: string,
    country: CountryCode = 'KR',
    onProgress?: (progress: { stage: string; percentage: number; message: string }) => void,
    onDetailedProgress?: (progress: DetailedProgressCallback) => void
  ): Promise<FilePipelineResult> {
    let currentStage: PipelineStage | null = null
    const stageStartTime = Date.now()
    
    const updateProgress = async (
      stage: PipelineStage,
      subProgress: number = 0,
      message?: string,
      lastFile?: string
    ) => {
      const percentage = calculateStageProgress(stage, subProgress)
      const config = STAGE_CONFIGS[stage]
      const displayMessage = message || config.label
      
      logStageTransition(currentStage, stage, stageStartTime)
      currentStage = stage
      
      onProgress?.({
        stage: stage,
        percentage: Math.round(percentage),
        message: displayMessage,
      })
      
      await tick() // UI 업데이트 보장
      
      return { stage, percentage, message: displayMessage }
    }

    try {
      const fileStatuses: FileParseStatus[] = files.map(file => ({
        fileName: file.file.name,
        status: 'pending',
        message: '대기 중...',
        progress: 0,
      }))

      // 1단계: 파일 읽기 준비 (FILES_READING)
      await updateProgress('FILES_READING', 0, '파일 준비 중...')
      
      // 2단계: ZIP 압축 해제 (ZIP_EXTRACT)
      await updateProgress('ZIP_EXTRACT', 0, '압축 파일 해제 중...')
      
      // 3단계: XBRL 파싱 (XBRL_PARSE) - 타임아웃 적용
      const xbrlParseStage = async () => {
        await updateProgress('XBRL_PARSE', 0, '재무 데이터 추출 중...')
        
        const parseResults = await parseUploadedFiles(
          files,
          country,
          async (fileStatus) => {
            // 파일 상태 업데이트
            const index = fileStatuses.findIndex(s => s.fileName === fileStatus.fileName)
            if (index !== -1) {
              fileStatuses[index] = fileStatus
            }

            // 단계 내 진행률 계산 (0-1 사이)
            const completedCount = fileStatuses.filter(s => s.status === 'completed' || s.status === 'error').length
            const subProgress = completedCount / files.length

            await updateProgress('XBRL_PARSE', subProgress, fileStatus.message, fileStatus.fileName)

            // 상세 진행 상태 콜백
            onDetailedProgress?.({
              percentage: calculateStageProgress('XBRL_PARSE', subProgress),
              message: fileStatus.message,
              fileStatuses: [...fileStatuses],
            })
            
            await tick() // UI 업데이트 보장
          }
        )
        
        return parseResults
      }
      
      const parseResults = await withTimeout(
        xbrlParseStage(),
        STAGE_CONFIGS.XBRL_PARSE.timeoutMs,
        'XBRL_PARSE'
      ).catch((error) => {
        console.warn(`[FilePipeline] XBRL_PARSE 타임아웃:`, error)
        throw new Error(`재무 데이터 추출 중 타임아웃이 발생했습니다. (${STAGE_CONFIGS.XBRL_PARSE.timeoutMs / 1000}초)`)
      })

      // 파싱 실패한 파일 확인
      const failedFiles = parseResults.filter(r => !r.success)
      if (failedFiles.length > 0) {
        await updateProgress('ERROR', 0, `파일 파싱 실패: ${failedFiles.map(f => f.error).join(', ')}`)
        return {
          success: false,
          parseResults,
          error: `파일 파싱 실패: ${failedFiles.map(f => f.error).join(', ')}`,
        }
      }

      // 4단계: PDF 파싱 (PDF_PARSE) - 타임아웃 적용
      const pdfParseStage = async () => {
        await updateProgress('PDF_PARSE', 0, '보고서 텍스트 추출 중...')
        
        // XBRL statement 수집 (xmlContent가 있는 것만)
        const xbrlStatements = Array.isArray(parseResults)
          ? parseResults
              .filter(r => r && r.financialStatement && r.xmlContent)
              .map(r => r.financialStatement!)
          : []
        
        let financialStatements: FinancialStatement[] = Array.isArray(xbrlStatements) ? [...xbrlStatements] : []
        
        // 파일 메타데이터 추출 및 누락 연도 감지
        await tick()
        const fileMetadata = mapFilesToMetadata(
          files.map(f => ({ file: f.file, name: f.file.name }))
        )
        const missingYears = detectMissingYears(fileMetadata)
        
        await tick()
        
        // PDF 표 숫자 fallback 정책: 기본 비활성 (XBRL이 1개라도 있으면 실행 안 함)
        const allowPdfNumericFallback = false // 기본값: false (XBRL 우선 원칙)
        
        // PDF 표 숫자 fallback 조건:
        // 1) XBRL statement가 없고
        // 2) allowPdfNumericFallback이 true일 때만 실행
        if (xbrlStatements.length === 0 && allowPdfNumericFallback) {
          await updateProgress('PDF_PARSE', 0.3, 'XBRL 데이터가 없어 PDF에서 재무제표 추출 중...')
          
          const pdfResults = Array.isArray(parseResults) ? parseResults.filter(r => r && r.pdfResult) : []
          for (let i = 0; i < pdfResults.length; i++) {
            const pdfResult = pdfResults[i]
            if (pdfResult && pdfResult.pdfResult) {
              try {
                const fileInfo = Array.isArray(files) ? files.find(f => 
                  Array.isArray(parseResults) && parseResults.findIndex(r => r === pdfResult) === files.indexOf(f)
                ) : undefined
                const fileName = fileInfo?.file.name || 'unknown.pdf'
                
                const fallbackStatement = extractFinancialTablesFromPDF(
                  pdfResult.pdfResult.text,
                  fileName
                )
                if (fallbackStatement) {
                  // 중복 체크: 같은 fiscalYear/quarter/periodType이 이미 XBRL로 존재하면 PDF는 버림 (우선순위: XBRL > PDF)
                  const isDuplicate = Array.isArray(financialStatements) && financialStatements.some(stmt => {
                    if (!stmt || !fallbackStatement) return false
                    const sameFiscalYear = stmt.fiscalYear === fallbackStatement.fiscalYear
                    const sameQuarter = (stmt.quarter || 0) === (fallbackStatement.quarter || 0)
                    const samePeriodType = (stmt.periodType || 'FY') === (fallbackStatement.periodType || 'FY')
                    return sameFiscalYear && sameQuarter && samePeriodType
                  })
                  
                  if (!isDuplicate && Array.isArray(financialStatements)) {
                    financialStatements.push(fallbackStatement)
                    const resultIndex = Array.isArray(parseResults) ? parseResults.findIndex(r => r === pdfResult) : -1
                    if (resultIndex !== -1) {
                      parseResults[resultIndex].financialStatement = fallbackStatement
                    }
                    break
                  } else {
                    console.log('[FilePipeline] PDF 표 숫자 fallback 스킵: XBRL statement와 중복 (fiscalYear/quarter/periodType 일치)')
                  }
                }
              } catch (error) {
                console.warn('[FilePipeline] PDF 표 추출 실패:', error)
              }
              
              await tick() // 각 파일 처리 후 yield
              await updateProgress('PDF_PARSE', 0.3 + (i / pdfResults.length) * 0.4, `PDF 분석 중 (${i + 1}/${pdfResults.length})`)
            }
          }
        } else if (xbrlStatements.length > 0) {
          console.log(`[FilePipeline] PDF 표 숫자 fallback 비활성: XBRL statement ${xbrlStatements.length}개 존재 (XBRL 우선 원칙)`)
        }
        
        return { financialStatements, missingYears, parseResults }
      }
      
      const { financialStatements, missingYears, parseResults: finalParseResults } = await withTimeout(
        pdfParseStage(),
        STAGE_CONFIGS.PDF_PARSE.timeoutMs,
        'PDF_PARSE'
      ).catch((error) => {
        console.warn(`[FilePipeline] PDF_PARSE 타임아웃:`, error)
        throw new Error(`보고서 텍스트 추출 중 타임아웃이 발생했습니다. (${STAGE_CONFIGS.PDF_PARSE.timeoutMs / 1000}초)`)
      })

      // 재무제표가 없어도 텍스트 인사이트만이라도 보여주기 (프리징 방지)
      if (financialStatements.length === 0) {
        await updateProgress('PDF_PARSE', 0.8, '재무제표 데이터가 없어 텍스트 분석으로 진행합니다...')
        
        // 더미 재무제표 생성 (최소한의 구조)
        const createDummyItem = (name: string, originalName: string) => ({
          name,
          originalName,
          source: 'DART' as const,
          standard: 'IFRS' as const,
          value: 0,
          unit: 'KRW',
        })

        const dummyStatement: FinancialStatement = {
          companyName: 'Unknown',
          ticker: '',
          country: 'KR',
          fiscalYear: new Date().getFullYear(),
          quarter: 0,
          incomeStatement: {
            revenue: createDummyItem('매출액', 'Revenue'),
            operatingIncome: createDummyItem('영업이익', 'OperatingIncome'),
            netIncome: createDummyItem('당기순이익', 'NetIncome'),
            eps: createDummyItem('EPS', 'EarningsPerShare'),
            depreciationAndAmortization: createDummyItem('감가상각비', 'DepreciationAndAmortization'),
            operatingCashFlow: createDummyItem('영업현금흐름', 'OperatingCashFlow'),
          },
          balanceSheet: {
            totalAssets: createDummyItem('자산총계', 'TotalAssets'),
            totalLiabilities: createDummyItem('부채총계', 'TotalLiabilities'),
            totalEquity: createDummyItem('자본총계', 'TotalEquity'),
            operatingAssets: createDummyItem('영업자산', 'OperatingAssets'),
            nonInterestBearingLiabilities: createDummyItem('비이자발생부채', 'NonInterestBearingLiabilities'),
            accountsReceivable: createDummyItem('매출채권', 'AccountsReceivable'),
            inventory: createDummyItem('재고자산', 'Inventory'),
          },
          cashFlowStatement: {
            operatingCashFlow: createDummyItem('영업현금흐름', 'OperatingCashFlow'),
            investingCashFlow: createDummyItem('투자현금흐름', 'InvestingCashFlow'),
            financingCashFlow: createDummyItem('재무현금흐름', 'FinancingCashFlow'),
            capitalExpenditure: createDummyItem('CAPEX', 'CapitalExpenditure'),
            freeCashFlow: createDummyItem('FCF', 'FreeCashFlow'),
          },
        }

        financialStatements.push(dummyStatement)
        await tick()
      }

      // PDF 텍스트 인사이트 추출 (PDF_PARSE 단계 내에서 처리)
      const pdfResults = finalParseResults
        .filter(r => r.pdfResult)
        .map(r => r.pdfResult!)
      
      await updateProgress('PDF_PARSE', 1.0, '보고서 텍스트 추출 완료')

      // 5단계: 분석 결과 구성 (BUILD_ANALYSIS) - 타임아웃 적용
      const buildAnalysisStage = async () => {
        await updateProgress('BUILD_ANALYSIS', 0, '분석 결과 구성 중...')
        
        // 정렬된 재무제표 생성
        await tick()
        let sortedFinancialStatements: FinancialStatement[]
        try {
          const financialHistory = mergeFinancialStatementsToHistory(financialStatements)
          sortedFinancialStatements = historyToFinancialStatements(financialHistory)
        } catch (error) {
          console.warn('[FilePipeline] 재무제표 정렬 실패, 원본 사용:', error)
          sortedFinancialStatements = financialStatements
        }
          
        await tick()
        await updateProgress('BUILD_ANALYSIS', 0.3, '재무제표 정렬 완료')
        
        // AnalysisBundle 생성
        await tick()
        
        // 회사명 결정 (우선순위: 재무제표에서 추출 > 파일명 기반 추출 > 기본값)
        let companyName = '기업명 미확인'
        if (sortedFinancialStatements.length > 0) {
          const firstStatement = sortedFinancialStatements[0]
          // 재무제표에서 추출한 회사명 확인
          if (firstStatement.companyName && 
              firstStatement.companyName !== '기업명 미확인' && 
              firstStatement.companyName !== 'Unknown Company') {
            companyName = firstStatement.companyName
          }
        }
        
        // 재무제표에서 추출 실패 시 파일명 기반 추출
        if (companyName === '기업명 미확인' && files.length > 0) {
          const { extractCompanyName } = await import('@/lib/utils/file-utils')
          const fileNameBasedName = extractCompanyName(files[0].file.name)
          if (fileNameBasedName && fileNameBasedName !== '기업명 미확인') {
            companyName = fileNameBasedName
          }
        }
        
        // 회사명을 재무제표에 반영 (파이프라인에서 확실히 주입)
        if (sortedFinancialStatements.length > 0) {
          sortedFinancialStatements.forEach(stmt => {
            if (!stmt.companyName || 
                stmt.companyName === '기업명 미확인' || 
                stmt.companyName === 'Unknown Company') {
              stmt.companyName = companyName
            }
          })
        }
        
        // 산업군 자동 분류 (PDF 텍스트 기반)
        let industryClassification: IndustryClassification | undefined = undefined
        
        // PDF 텍스트 기반 키워드 매칭 (사업 관련 섹션 중심으로 제한)
        const pdfResultsWithPageMap = finalParseResults
          .filter(r => r.pdfResult && r.pdfResult.text && r.pdfResult.pageMap)
        
        if (pdfResultsWithPageMap.length > 0) {
          // 사업 관련 섹션 페이지 추출
          const businessSectionTexts: string[] = []
          
          for (const result of pdfResultsWithPageMap) {
            const pageMap = result.pdfResult!.pageMap
            const businessPagePattern = /사업의\s*내용|주요\s*제품|제품\s*및\s*서비스|영업의\s*개황|부문\s*정보|세그먼트|매출\s*구성/i
            
            // 사업 관련 섹션 페이지 찾기
            const businessPages: number[] = []
            for (const [pageNum, pageText] of pageMap.entries()) {
              if (businessPagePattern.test(pageText)) {
                businessPages.push(pageNum)
              }
            }
            
            if (businessPages.length > 0) {
              // 발견된 페이지와 ±1페이지를 합침
              const pagesToInclude = new Set<number>()
              for (const pageNum of businessPages) {
                pagesToInclude.add(pageNum)
                if (pageNum > 1) pagesToInclude.add(pageNum - 1)
                if (pageNum < pageMap.size) pagesToInclude.add(pageNum + 1)
              }
              
              // 페이지 텍스트 결합
              const sectionText = Array.from(pagesToInclude)
                .sort((a, b) => a - b)
                .map(pageNum => pageMap.get(pageNum) || '')
                .filter(text => text.trim().length > 0)
                .join('\n\n')
              
              if (sectionText.trim().length > 0) {
                businessSectionTexts.push(sectionText)
              }
            } else {
              // Fallback: 앞쪽 5~8페이지 + 목차 주변(가능하면)만 사용
              const allPages = Array.from(pageMap.keys()).sort((a, b) => a - b)
              
              // 목차 페이지 찾기 (간단한 휴리스틱)
              let tocPage: number | undefined = undefined
              for (const [pageNum, pageText] of pageMap.entries()) {
                if (/목차|차례|Contents|Table\s+of\s+Contents/i.test(pageText)) {
                  tocPage = pageNum
                  break
                }
              }
              
              const fallbackPages = new Set<number>()
              
              // 앞쪽 5~8페이지
              const frontPages = allPages.slice(0, 8)
              frontPages.forEach(p => fallbackPages.add(p))
              
              // 목차 다음 2~3페이지 (목차가 있으면)
              if (tocPage !== undefined) {
                for (let i = 1; i <= 3; i++) {
                  const nextPage = tocPage + i
                  if (pageMap.has(nextPage)) {
                    fallbackPages.add(nextPage)
                  }
                }
              }
              
              const fallbackText = Array.from(fallbackPages)
                .sort((a, b) => a - b)
                .map(pageNum => pageMap.get(pageNum) || '')
                .filter(text => text.trim().length > 0)
                .join('\n\n')
              
              if (fallbackText.trim().length > 0) {
                businessSectionTexts.push(fallbackText)
              }
            }
          }
          
          // 사업 섹션 텍스트 결합
          const combinedPdfText = businessSectionTexts.length > 0
            ? businessSectionTexts.join('\n\n')
            : pdfResultsWithPageMap.map(r => r.pdfResult!.text).join('\n\n') // 최종 fallback
          
          // pageMap과 businessSectionPages 수집 (첫 번째 PDF 결과 사용)
          const firstPdfResult = pdfResultsWithPageMap[0]?.pdfResult
          const combinedPageMap = firstPdfResult?.pageMap
          const allBusinessPages: number[] = []
          for (const result of pdfResultsWithPageMap) {
            const pageMap = result.pdfResult!.pageMap
            const businessPagePattern = /사업의\s*내용|주요\s*제품|제품\s*및\s*서비스|영업의\s*개황|부문\s*정보|세그먼트|매출\s*구성/i
            for (const [pageNum, pageText] of pageMap.entries()) {
              if (businessPagePattern.test(pageText)) {
                allBusinessPages.push(pageNum)
              }
            }
          }
          
          // pageMap 중 페이지 수가 가장 큰 PDF 선택 (요구사항 D-2)
          const bestPdf = pdfResultsWithPageMap
            .sort((a, b) => {
              const aPageCount = a.pdfResult?.pageMap instanceof Map ? a.pdfResult.pageMap.size : Object.keys((a.pdfResult as any)?.pageMap || {}).length
              const bPageCount = b.pdfResult?.pageMap instanceof Map ? b.pdfResult.pageMap.size : Object.keys((b.pdfResult as any)?.pageMap || {}).length
              return bPageCount - aPageCount
            })[0]
          
          const bestPageMap = bestPdf?.pdfResult?.pageMap
          
          // PDF 텍스트에서 산업군 분류
          const bestSectionMap = bestPdf?.pdfResult?.sectionMap
          const bestHeadingMap = bestPdf?.pdfResult?.headingMap
          
          const classification = classifyIndustryFromPDF(
            combinedPdfText, 
            companyName,
            bestPageMap || combinedPageMap, // bestPageMap 우선, 없으면 combinedPageMap
            allBusinessPages.length > 0 ? allBusinessPages : undefined,
            bestSectionMap,
            bestHeadingMap
          )
          if (classification) {
            industryClassification = {
              label: classification.label,
              confidence: classification.confidence,
              evidence: classification.evidence,
              coreCategories: classification.coreCategories,
              adjacentCategories: classification.adjacentCategories,
              reasonCode: classification.reasonCode,
            }
            
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[IndustryClassifier] 산업군 분류 결과: ${classification.label} (confidence: ${classification.confidence.toFixed(2)})`)
            }
          }
        }
        
        const analysisBundle = buildAnalysisBundle(
          finalParseResults,
          files,
          companyName,
          undefined,
          industryClassification
        )
        
        await tick()
        await updateProgress('BUILD_ANALYSIS', 0.6, 'AnalysisBundle 생성 완료')
        
        // 브리핑 생성
        await tick()
        const latestFinancialStatement = Array.isArray(sortedFinancialStatements) ? sortedFinancialStatements[0] : sortedFinancialStatements
        const previousFinancialStatement = Array.isArray(sortedFinancialStatements) && sortedFinancialStatements.length > 1 ? sortedFinancialStatements[1] : undefined
        
        // 회사명이 확실히 설정된 재무제표로 브리핑 생성
        if (latestFinancialStatement && (!latestFinancialStatement.companyName || latestFinancialStatement.companyName === '기업명 미확인')) {
          latestFinancialStatement.companyName = companyName
        }
        
        // briefing 생성 시 산업 분류 정보 전달 (analysisBundle.company.industry 우선)
        const briefingIndustry = analysisBundle.company.industry || industry as any
        
        const briefing = generateBriefing(
          latestFinancialStatement,
          previousFinancialStatement,
          briefingIndustry, // IndustryClassification 객체 또는 레거시 IndustryType
          false,
          analysisBundle.dataQuality // dataQuality 정보 전달
        )
        
        // briefing.companyName이 undefined가 되지 않도록 보장
        if (!briefing.companyName || briefing.companyName === 'undefined' || briefing.companyName === 'Unknown Company') {
          briefing.companyName = companyName
        }
        
        await tick()
        await updateProgress('BUILD_ANALYSIS', 1.0, '분석 리포트 생성 완료')
        
        return { sortedFinancialStatements, analysisBundle, briefing }
      }
      
      const { sortedFinancialStatements, analysisBundle, briefing } = await withTimeout(
        buildAnalysisStage(),
        STAGE_CONFIGS.BUILD_ANALYSIS.timeoutMs,
        'BUILD_ANALYSIS'
      ).catch((error) => {
        console.warn(`[FilePipeline] BUILD_ANALYSIS 타임아웃:`, error)
        throw new Error(`분석 결과 구성 중 타임아웃이 발생했습니다. (${STAGE_CONFIGS.BUILD_ANALYSIS.timeoutMs / 1000}초)`)
      })
      
      await tick()
      
      // 6단계: 완료 (DONE)
      await updateProgress('DONE', 1.0, '분석 완료')
      
      onDetailedProgress?.({
        percentage: 100,
        message: '분석 완료',
        fileStatuses: fileStatuses.map(s => ({
          ...s,
          status: 'completed',
          message: '완료',
        })),
        missingYears: missingYears.length > 0 ? missingYears : undefined,
        dataWarning: missingYears.length > 0
          ? UI_TEXT.insufficientDataDescription
          : undefined,
      })
      
      await tick()

      // PDF 인사이트 추가 (이미 briefing에 포함되어 있을 수 있음)
      if (pdfResults.length > 0 && briefing) {
        const allContradictions: string[] = []

        for (const pdfResult of pdfResults) {
          allContradictions.push(...pdfResult.accountingContradictions)
        }

        // 브리핑에 인사이트 섹션 추가 (중복 체크)
        // 경영진 핵심 언어 섹션은 제거됨 (초반 노출 금지)
        if (allContradictions.length > 0 && !briefing.sections.some(s => s.title === '회계적 모순점')) {
          briefing.sections.push({
            title: '회계적 모순점',
            content: allContradictions.slice(0, 3).join('. '),
            priority: 'high',
            warning: true,
          })
        }
      }

      // AnalysisBundle을 JSON으로 로깅 (개발 환경, 사용자 요청: period 정보 확인용)
      // period 정보는 항상 로깅 (방어 로직 검증용)
      if (analysisBundle.statements.length > 0 && analysisBundle.statements[0].period) {
        const firstPeriod = analysisBundle.statements[0].period
        console.log('[AnalysisBundle] === 생성 완료 ===')
        console.log('[AnalysisBundle] statements[0].period:', {
          periodType: firstPeriod.periodType,
          startDate: firstPeriod.startDate || 'N/A',
          endDate: firstPeriod.endDate || 'N/A',
          quarter: firstPeriod.quarter || 'N/A',
          fiscalYear: firstPeriod.fiscalYear || 'N/A'
        })
        
        // 개발 환경에서만 전체 JSON 로깅 (용량 고려)
        if (process.env.NODE_ENV === 'development' || (typeof window !== 'undefined' && (window as any).__DEV__)) {
          console.log('[AnalysisBundle] 전체 JSON:', JSON.stringify(analysisBundle, null, 2))
        }
      }

      const fileCount = Array.isArray(sortedFinancialStatements) ? sortedFinancialStatements.length : 0

      return {
        success: true,
        parseResults: finalParseResults,
        briefing,
        sortedFinancialStatements,
        analysisBundle, // 레벨2 동등성 계약 준수 결과
        fileCount,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
      const elapsedMs = Date.now() - stageStartTime
      
      console.warn(`[FilePipeline] 에러 발생 (단계: ${currentStage || 'UNKNOWN'}, 소요시간: ${elapsedMs}ms):`, errorMessage)
      
      await updateProgress('ERROR', 0, `오류: ${errorMessage}`).catch(() => {})
      
      return {
        success: false,
        parseResults: [],
        error: errorMessage,
      }
    }
  }
}

/**
 * 파일 파이프라인 인스턴스
 */
let filePipelineInstance: FilePipeline | null = null

/**
 * 파일 파이프라인 인스턴스 가져오기
 */
export function getFilePipeline(): FilePipeline {
  if (!filePipelineInstance) {
    filePipelineInstance = new FilePipeline()
  }
  return filePipelineInstance
}
