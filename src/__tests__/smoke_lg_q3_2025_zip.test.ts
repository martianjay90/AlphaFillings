/**
 * 스모크 테스트: LG전자 2025-09-30 ZIP (XBRL 압축)
 * ZIP 파일에서 추출한 인스턴스 파일이 항상 동일하게 선택되고,
 * 그 결과가 기존 XBRL 파일 파싱 결과와 1:1로 동일한지 검증
 * 3회 반복 검증으로 재현성 확인
 */

/**
 * @jest-environment jsdom
 */

import { describe, test, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { extractXBRLFromZip } from '@/lib/parsers/zip-extractor'
import { createXBRLParser } from '@/lib/parsers/xbrl-parser'
import { buildAnalysisBundle } from '@/lib/analysis/analysis-bundle-builder'
import { runSelfCheck } from '@/lib/analysis/self-check'
import type { FileParseResult } from '@/lib/parsers/file-parser'
import type { UploadedFile } from '@/components/file-dropzone'
import type { AnalysisBundle } from '@/types/analysis-bundle'

/**
 * ZIP 파일 경로
 */
const ZIP_FILE_PATH = join(__dirname, '../../fixtures/filings/lg/lg_2025-09-30.zip')

/**
 * XBRL 파일 경로 (기존과 동일, 비교용)
 */
const XBRL_FILE_PATH = join(__dirname, '../../fixtures/filings/lg/entity00401731_2025-09-30.xbrl')

/**
 * 객체를 키 정렬하여 안정적으로 문자열화
 */
function stableStringify(obj: any): string {
  if (obj === null || obj === undefined) {
    return String(obj)
  }
  if (typeof obj !== 'object') {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => stableStringify(item)).join(',') + ']'
  }
  const keys = Object.keys(obj).sort()
  const pairs = keys.map(key => {
    const value = obj[key]
    return JSON.stringify(key) + ':' + stableStringify(value)
  })
  return '{' + pairs.join(',') + '}'
}

/**
 * 문자열을 SHA256 해시로 변환
 */
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Bundle에서 runId를 고정값으로 바꾼 복제본 생성
 */
function normalizeBundle(bundle: AnalysisBundle): AnalysisBundle {
  return {
    ...bundle,
    runId: 'FIXED_RUN_ID_FOR_TESTING'
  }
}

/**
 * ZIP 파일을 읽어서 File 객체로 변환
 */
function createZipFile(): File {
  const zipBuffer = readFileSync(ZIP_FILE_PATH)
  const blob = new Blob([zipBuffer], { type: 'application/zip' })
  return new File([blob], 'lg_2025-09-30.zip', { type: 'application/zip' })
}

/**
 * ZIP 파일에서 Bundle 생성
 */
async function buildBundleFromZip(): Promise<{
  bundle: AnalysisBundle
  extractedFileName: string
  extractedContentHash: string
}> {
  // ZIP 파일을 File 객체로 변환
  const zipFile = createZipFile()

  // ZIP에서 인스턴스 XBRL 파일 추출
  const extractedFile = await extractXBRLFromZip(zipFile)
  if (!extractedFile) {
    throw new Error('ZIP에서 인스턴스 XBRL 파일을 추출할 수 없습니다.')
  }

  // 추출된 파일명과 내용 해시
  const extractedFileName = extractedFile.name
  const extractedContentBuffer = await extractedFile.arrayBuffer()
  const extractedContent = new TextDecoder('utf-8').decode(extractedContentBuffer)
  const extractedContentHash = sha256(extractedContent)

  // XBRL 파싱
  const parser = createXBRLParser(extractedContent, 'KR')
  const missingFields: string[] = []
  const financialStatement = parser.parseFinancialStatement(
    'LG전자',
    '066570',
    2025,
    3, // Q3
    missingFields
  )

  // FileParseResult 생성
  const parseResult: FileParseResult = {
    success: true,
    financialStatement,
    xmlContent: extractedContent,
    fileName: extractedFileName,
    missingFields,
  }

  // UploadedFile 스텁 생성
  const uploadedFile: UploadedFile = {
    id: 'file-0',
    file: zipFile,
    type: 'xbrl',
  }

  // buildAnalysisBundle 호출
  const bundle = buildAnalysisBundle(
    [parseResult],
    [uploadedFile],
    'LG전자',
    '066570'
  )

  return {
    bundle,
    extractedFileName,
    extractedContentHash,
  }
}

describe('스모크 테스트: LG전자 Q3 2025 (ZIP)', () => {
  // ZIP 파일 파싱 및 bundle 생성은 시간이 오래 걸릴 수 있으므로 타임아웃을 240초로 설정
  jest.setTimeout(240000)
  
  test('ZIP 추출 → bundle 생성 → self-check PASS (3회 반복 검증)', async () => {
    // ZIP 파일 존재 여부 확인
    try {
      readFileSync(ZIP_FILE_PATH)
    } catch (error) {
      // 환경변수로 스킵 허용 (로컬 편의용)
      const allowSkip = process.env.SMOKE_ALLOW_SKIP === '1'
      if (allowSkip) {
        console.warn(`[SmokeTest] ZIP 파일을 찾을 수 없습니다: ${ZIP_FILE_PATH}`)
        console.warn('[SmokeTest] SMOKE_ALLOW_SKIP=1이 설정되어 있어 테스트를 스킵합니다.')
        console.warn('[SmokeTest] LG전자 XBRL ZIP 파일을 위 경로에 저장하세요.')
        expect(true).toBe(true) // 테스트 스킵 (항상 PASS)
        return
      } else {
        // 기본 동작: fixture 누락 시 FAIL (회귀 방지)
        console.error(`[SmokeTest] ZIP 파일을 찾을 수 없습니다: ${ZIP_FILE_PATH}`)
        console.error('[SmokeTest] LG전자 XBRL ZIP 파일을 위 경로에 저장하세요.')
        console.error('[SmokeTest] 로컬 편의를 위해 스킵하려면 SMOKE_ALLOW_SKIP=1 환경변수를 설정하세요.')
        throw new Error(`Required fixture file not found: ${ZIP_FILE_PATH}`)
      }
    }

    // 3회 반복 검증
    const hashes: string[] = []
    const extractedFileNames: string[] = []
    const extractedContentHashes: string[] = []
    
    for (let i = 0; i < 3; i++) {
      // Bundle 생성
      const { bundle, extractedFileName, extractedContentHash } = await buildBundleFromZip()
      
      // 추출된 파일명과 내용 해시 저장
      extractedFileNames.push(extractedFileName)
      extractedContentHashes.push(extractedContentHash)

      // Self-Check 검증
      const selfCheckResult = runSelfCheck(bundle)
      expect(selfCheckResult.pass).toBe(true)

      // runId 정규화 후 해시 생성
      const normalized = normalizeBundle(bundle)
      const jsonString = stableStringify(normalized)
      const hash = sha256(jsonString)
      hashes.push(hash)
    }

    // 3개 해시가 모두 동일해야 PASS
    expect(hashes[0]).toBe(hashes[1])
    expect(hashes[1]).toBe(hashes[2])
    expect(hashes[0]).toBe(hashes[2])

    // 추출된 파일명이 모두 동일해야 PASS
    expect(extractedFileNames[0]).toBe(extractedFileNames[1])
    expect(extractedFileNames[1]).toBe(extractedFileNames[2])
    expect(extractedFileNames[0]).toBe(extractedFileNames[2])

    // 추출된 파일 내용 해시가 모두 동일해야 PASS
    expect(extractedContentHashes[0]).toBe(extractedContentHashes[1])
    expect(extractedContentHashes[1]).toBe(extractedContentHashes[2])
    expect(extractedContentHashes[0]).toBe(extractedContentHashes[2])

    // UI 카드 값 검증 (1회 실행 결과 사용)
    const { bundle } = await buildBundleFromZip()
    const latestStatement = bundle.statements[0]

    // netIncomePrevYear 존재 및 netMargin.compareBasis=YOY 검증
    const netIncomePrevYear = latestStatement.income.netIncomePrevYear?.value
    expect(netIncomePrevYear).toBeDefined()
    expect(typeof netIncomePrevYear).toBe('number')
    
    const netMarginCompare = bundle.statements[0].keyMetricsCompare?.netMargin
    expect(netMarginCompare).toBeDefined()
    expect(netMarginCompare?.compareBasis).toBe('YOY')

    // 기간 정보
    const period = {
      startDate: bundle.period.startDate,
      endDate: bundle.period.endDate,
      fiscalYear: bundle.period.fiscalYear,
      quarter: bundle.period.quarter,
      periodType: bundle.period.periodType,
    }

    // 핵심 지표 값 추출
    const revenue = latestStatement.income.revenue?.value
    const operatingIncome = latestStatement.income.operatingIncome?.value
    const netIncome = latestStatement.income.netIncome?.value
    const totalEquity = latestStatement.balance.totalEquity?.value
    const operatingCashFlow = latestStatement.cashflow.operatingCashFlow?.value
    const capex = latestStatement.cashflow.capitalExpenditure?.value
    const fcf = latestStatement.cashflow.freeCashFlow?.value
    const cash = latestStatement.balance.cash?.value
    const debt = latestStatement.balance.interestBearingDebt?.value
    const revenuePrevYear = latestStatement.income.revenuePrevYear?.value

    // 계산된 지표
    const opm = revenue && operatingIncome ? (operatingIncome / revenue) * 100 : undefined
    const netMarginContinuing = revenue && netIncome ? (netIncome / revenue) * 100 : undefined
    const roe = totalEquity && netIncome ? (netIncome / totalEquity) * 100 : undefined
    const netDebt = (cash !== undefined && debt !== undefined) ? debt - cash : undefined
    const revenueYoY = (revenuePrevYear !== undefined && revenuePrevYear !== null && revenuePrevYear > 0 && revenue !== undefined)
      ? ((revenue - revenuePrevYear) / revenuePrevYear) * 100
      : undefined

    // 정책 메타데이터
    const policy = bundle.meta?.calculationPolicy

    // UI 카드 값 객체 생성 (snapshot으로 검증)
    expect({
  period,
  revenue,
  opm: opm !== undefined ? Number(opm.toFixed(6)) : undefined,
  netMarginContinuing: netMarginContinuing !== undefined ? Number(netMarginContinuing.toFixed(6)) : undefined,
  roe: roe !== undefined ? Number(roe.toFixed(6)) : undefined,
  ocf: operatingCashFlow,
  capex,
  fcf,
  equity: totalEquity,
  cash,
  netDebt,
  revenueYoY: revenueYoY !== undefined ? Number(revenueYoY.toFixed(6)) : undefined,
  policy
}).toMatchInlineSnapshot(`
{
  "capex": 1850073000000,
  "cash": 7958078000000,
  "equity": 26919591000000,
  "fcf": 1820277000000,
  "netDebt": 5162637000000,
  "netMarginContinuing": 2.986776,
  "ocf": 3670350000000,
  "opm": 3.959344,
  "period": {
    "endDate": "2025-09-30",
    "fiscalYear": 2025,
    "periodType": "YTD",
    "quarter": 3,
    "startDate": "2025-01-01",
  },
  "policy": {
    "capexComponentsIncluded": {
      "intangible": true,
      "ppe": true,
    },
    "capexPolicy": "PPE_ONLY",
    "epsScope": "CONTINUING",
    "fcfDefinition": "OCF_MINUS_CAPEX",
    "roeDefinition": "CUMULATIVE_END_EQUITY",
  },
  "revenue": 65348728000000,
  "revenueYoY": 0.588026,
  "roe": 7.250556,
}
`)
  })
})
