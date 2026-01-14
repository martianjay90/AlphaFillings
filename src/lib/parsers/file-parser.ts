/**
 * 파일 기반 파서
 * 로컬에서 업로드된 PDF 및 XBRL 파일을 파싱
 */

import { createXBRLParser } from './xbrl-parser'
import type { FinancialStatement } from '@/types/financial'
import type { CountryCode } from '@/types/industry'
import type { UploadedFile } from '@/components/file-dropzone'
import { extractYearFromFileName, extractReportType } from '@/lib/utils/file-utils'
import { extractXBRLFromZip } from './zip-extractor'
import { processPDFPageLayout, buildSectionAndHeadingMaps, type TextItem } from './pdf-layout'

/**
 * PDF 파싱 결과
 */
export interface PDFParseResult {
  /** 추출된 텍스트 */
  text: string
  
  /** 페이지별 텍스트 매핑 */
  pageMap: Map<number, string>
  
  /** 페이지별 섹션 맵 (페이지 번호 -> 섹션명) */
  sectionMap?: Map<number, string>
  
  /** 페이지별 헤딩 맵 (페이지 번호 -> 헤딩명) */
  headingMap?: Map<number, string>
  
  /** 경영진 핵심 언어 */
  keyManagementLanguage: string[]
  
  /** 회계적 모순점 */
  accountingContradictions: string[]
}

/**
 * 파일 파싱 결과
 */
export interface FileParseResult {
  /** 성공 여부 */
  success: boolean
  
  /** 재무제표 데이터 (XBRL에서 추출) */
  financialStatement?: FinancialStatement
  
  /** PDF 파싱 결과 */
  pdfResult?: PDFParseResult
  
  /** XBRL 원본 XML 내용 (시계열 병합용) */
  xmlContent?: string
  
  /** 파일명 (시계열 병합용) */
  fileName?: string
  
  /** 누락된 필드 목록 (UI에서 '데이터 부족' 표기용) */
  missingFields?: string[]
  
  /** 에러 메시지 */
  error?: string
}

/**
 * PDF 파일 파싱 (텍스트 및 주석 분석)
 */
export async function parsePDFFile(
  file: File
): Promise<PDFParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer
        if (!arrayBuffer) {
          throw new Error('파일 읽기 실패')
        }

        // PDF.js를 동적으로 로드
        let pdfjsLib: any
        
        if (typeof window !== 'undefined') {
          // PDF.js가 이미 로드되어 있는지 확인
          if ('pdfjsLib' in window) {
            // @ts-ignore - pdfjsLib는 동적으로 로드됨
            pdfjsLib = window.pdfjsLib
          } else {
            // PDF.js를 동적으로 로드 (CDN 사용)
            const script = document.createElement('script')
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
            script.async = true
            await new Promise((resolve, reject) => {
              script.onload = resolve
              script.onerror = reject
              document.head.appendChild(script)
            })
            
            // @ts-ignore
            pdfjsLib = window.pdfjsLib
            // @ts-ignore
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
          }

          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
          
          const pageMap = new Map<number, string>()
          const pageResults = new Map<number, { text: string; lines: any[]; heading: string | null }>()
          let fullText = ''

          // 모든 페이지에서 텍스트 추출 (레이아웃 구조 복원)
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const textContent = await page.getTextContent()
            
            // TextItem들을 레이아웃 구조로 변환
            const textItems: TextItem[] = textContent.items.map((item: any) => ({
              str: item.str,
              transform: item.transform || [1, 0, 0, 1, 0, 0],
            }))
            
            const layoutResult = processPDFPageLayout(i, textItems)
            
            // pageMap에 문단 구조를 가진 텍스트 저장
            pageMap.set(i, layoutResult.text)
            pageResults.set(i, layoutResult)
            
            // fullText에 페이지 구분(\n\n) 추가
            if (fullText) {
              fullText += '\n\n'
            }
            fullText += layoutResult.text
          }
          
          // sectionMap과 headingMap 생성
          const { sectionMap, headingMap } = buildSectionAndHeadingMaps(pageResults)

          // 경영진 핵심 언어 추출
          const keyManagementLanguage = extractKeyManagementLanguage(fullText)
          
          // 회계적 모순점 추출
          const accountingContradictions = extractAccountingContradictions(fullText)

          resolve({
            text: fullText,
            pageMap,
            sectionMap,
            headingMap,
            keyManagementLanguage,
            accountingContradictions
          })
        } else {
          throw new Error('PDF 파싱은 브라우저 환경에서만 지원됩니다.')
        }
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => {
      reject(new Error('파일 읽기 오류'))
    }

    reader.readAsArrayBuffer(file)
  })
}

/**
 * XBRL 파일 파싱 (재무 수치 추출)
 * @param file XBRL 파일
 * @param country 국가 코드
 * @param missingFields 누락 필드 목록을 누적할 배열 (옵션)
 * @returns 재무제표 데이터 및 누락 필드 목록
 */
export async function parseXBRLFile(
  file: File,
  country: CountryCode = 'KR',
  missingFields: string[] = []
): Promise<{ financialStatement: FinancialStatement; missingFields: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const xmlContent = e.target?.result as string
        if (!xmlContent) {
          throw new Error('파일 읽기 실패')
        }

        const parser = createXBRLParser(xmlContent, country)
        // fiscalYear를 0(unknown)으로 설정 - 나중에 timeseries-merger가 추출
        // quarter도 0으로 설정 - 파일명에서 추출될 수 있도록
        const financialStatement = parser.parseFinancialStatement(
          'Unknown Company',
          '',
          0, // fiscalYear: 0 (unknown)
          0, // quarter: 0 (unknown)
          missingFields // 누락 필드 목록 누적
        )

        resolve({ financialStatement, missingFields })
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => {
      reject(new Error('파일 읽기 오류'))
    }

    reader.readAsText(file)
  })
}

/**
 * 파일별 파싱 상태
 */
export interface FileParseStatus {
  fileName: string
  status: 'pending' | 'parsing' | 'completed' | 'error'
  message: string
  progress: number
}

/**
 * 업로드된 파일들을 순차적으로 파싱 (성능 최적화)
 * 각 파일의 진행 상태를 추적하여 콜백으로 전달
 */
export async function parseUploadedFiles(
  files: UploadedFile[],
  country: CountryCode = 'KR',
  onFileProgress?: (status: FileParseStatus) => void
): Promise<FileParseResult[]> {
  const results: FileParseResult[] = []
  const totalFiles = files.length

  // 순차적으로 처리하여 브라우저 부하 방지
  for (let i = 0; i < files.length; i++) {
    const uploadedFile = files[i]
    const fileName = uploadedFile.file.name
    
    try {
      // 파일 진행 상태 업데이트
      onFileProgress?.({
        fileName,
        status: 'parsing',
        message: getParsingMessage(uploadedFile, fileName, i, totalFiles),
        progress: (i / totalFiles) * 100,
      })

      let result: FileParseResult

      if (uploadedFile.type === 'pdf') {
        const pdfResult = await parsePDFFile(uploadedFile.file)
        result = {
          success: true,
          pdfResult,
          fileName: uploadedFile.file.name, // 시계열 병합용
        } as FileParseResult
      } else if (uploadedFile.type === 'xbrl') {
        // ZIP 파일인 경우 즉시 메모리에서 압축 해제하여 가장 큰 XML/XBRL 파일 추출
        let fileToParse = uploadedFile.file
        let xmlContent = ''
        
        // ZIP 파일 감지 (확장자 또는 MIME 타입)
        const isZipFile = uploadedFile.file.name.toLowerCase().endsWith('.zip') ||
                         uploadedFile.file.type.includes('zip')
        
        if (isZipFile) {
          onFileProgress?.({
            fileName,
            status: 'parsing',
            message: getParsingMessage(uploadedFile, fileName, i, totalFiles) + ' (ZIP 압축 해제 중 - 가장 큰 인스턴스 파일 찾는 중...)',
            progress: (i / totalFiles) * 100,
          })
          
          // ZIP 파일에서 인스턴스 XBRL 파일 추출 (파일명 + 내용 기반 선택)
          const extractedFile = await extractXBRLFromZip(uploadedFile.file)
          if (extractedFile) {
            // 파일 타입을 xbrl로 강제 지정 (PDF 분석 로직과 혼선 방지)
            fileToParse = extractedFile
            console.log(`[File Parser] ZIP에서 추출된 인스턴스 파일: ${extractedFile.name}`)
            console.log(`[File Parser] 선택된 인스턴스 파일명: ${extractedFile.name}, 타입: xbrl로 강제 지정`)
          } else {
            throw new Error('ZIP 파일에서 XBRL/XML 인스턴스 파일을 찾을 수 없습니다. ZIP 내부에 .xml 또는 .xbrl 파일이 있는지 확인해주세요.')
          }
        }

        // XML 내용 읽기 (시계열 병합용)
        xmlContent = await fileToParse.text()
        
        // 파일 타입 재확인 (xbrl로 강제 지정)
        if (fileToParse.type !== 'application/xml' && !fileToParse.name.toLowerCase().endsWith('.xml') && !fileToParse.name.toLowerCase().endsWith('.xbrl')) {
          console.warn(`[File Parser] 파일 타입이 예상과 다릅니다: ${fileToParse.name}, xbrl로 강제 처리합니다.`)
        }
        
        // 누락 필드 목록 초기화
        const missingFields: string[] = []
        const parseResult = await parseXBRLFile(fileToParse, country, missingFields)
        
        result = {
          success: true,
          financialStatement: parseResult.financialStatement,
          missingFields: parseResult.missingFields.length > 0 ? parseResult.missingFields : undefined,
          xmlContent,
          fileName: uploadedFile.file.name, // 원본 ZIP 파일명 유지
        } as FileParseResult
      } else {
        result = {
          success: false,
          error: '지원하지 않는 파일 형식입니다.'
        } as FileParseResult
      }

      results.push(result)

      // 완료 상태 업데이트
      onFileProgress?.({
        fileName,
        status: result.success ? 'completed' : 'error',
        message: result.success ? '파싱 완료' : result.error || '파싱 실패',
        progress: ((i + 1) / totalFiles) * 100,
      })

      // 다음 파일 처리 전 짧은 지연 (브라우저 안정성)
      if (i < files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    } catch (error) {
      const errorResult: FileParseResult = {
        success: false,
        error: error instanceof Error ? error.message : '파싱 실패'
      }
      results.push(errorResult)

      onFileProgress?.({
        fileName,
        status: 'error',
        message: errorResult.error || '파싱 실패',
        progress: ((i + 1) / totalFiles) * 100,
      })
    }
  }

  return results
}

/**
 * 파싱 메시지 생성 (파일 번호 포함)
 */
function getParsingMessage(
  uploadedFile: UploadedFile, 
  fileName: string,
  currentIndex: number,
  totalFiles: number
): string {
  const year = extractYearFromFileName(fileName)
  const reportType = extractReportType(fileName)
  
  const fileNumber = `[${currentIndex + 1}/${totalFiles}]`
  
  if (uploadedFile.type === 'pdf') {
    if (year && reportType) {
      return `${fileNumber} ${year}년 ${reportType} 파싱 중...`
    } else if (year) {
      return `${fileNumber} ${year}년 PDF 사업보고서 주석 문맥 분석 중...`
    } else if (reportType) {
      return `${fileNumber} PDF ${reportType} 주석 문맥 분석 중...`
    }
    return `${fileNumber} PDF 파일 파싱 중...`
  } else if (uploadedFile.type === 'xbrl') {
    if (year) {
      return `${fileNumber} ${year}년 XBRL 재무 수치 추출 중...`
    }
    return `${fileNumber} XBRL 재무 수치 추출 중...`
  }
  
  return `${fileNumber} 파일 파싱 중...`
}

/**
 * 경영진 핵심 언어 추출
 */
function extractKeyManagementLanguage(text: string): string[] {
  const keywords = [
    '성장', '확대', '투자', '혁신', '전략', '비전',
    '도전', '기회', '위험', '불확실성', '과제',
    '지속가능', 'ESG', '환경', '사회', '지배구조'
  ]

  const sentences = text.split(/[.!?]\s+/)
  const keySentences: string[] = []

  for (const sentence of sentences) {
    const keywordCount = keywords.filter(keyword => 
      sentence.includes(keyword)
    ).length

    if (keywordCount >= 2 && sentence.length > 20 && sentence.length < 200) {
      keySentences.push(sentence.trim())
    }

    if (keySentences.length >= 10) break
  }

  return keySentences
}

/**
 * 회계적 모순점 추출
 */
function extractAccountingContradictions(text: string): string[] {
  const contradictionPatterns = [
    /(증가|감소|상승|하락).*?하지만.*?(감소|증가|하락|상승)/gi,
    /(기대|예상).*?하지만.*?(실제|결과)/gi,
    /(계획|목표).*?하지만.*?(달성|미달성)/gi,
    /(전년|전기).*?비교.*?(일관성|변화)/gi
  ]

  const contradictions: string[] = []
  const sentences = text.split(/[.!?]\s+/)

  for (const sentence of sentences) {
    for (const pattern of contradictionPatterns) {
      if (pattern.test(sentence) && sentence.length > 30 && sentence.length < 300) {
        contradictions.push(sentence.trim())
        break
      }
    }

    if (contradictions.length >= 5) break
  }

  return contradictions
}
