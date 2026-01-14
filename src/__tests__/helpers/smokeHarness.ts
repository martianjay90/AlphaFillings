/**
 * 스모크 테스트 헬퍼 함수
 * 테이블 기반 스모크 테스트에서 재사용하는 유틸리티
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { extractXBRLFromZip } from '@/lib/parsers/zip-extractor'
import { createXBRLParser } from '@/lib/parsers/xbrl-parser'
import { buildAnalysisBundle } from '@/lib/analysis/analysis-bundle-builder'
import type { FileParseResult } from '@/lib/parsers/file-parser'
import type { UploadedFile } from '@/components/file-dropzone'
import type { AnalysisBundle } from '@/types/analysis-bundle'
import type { KeyMetricsCompare } from '@/types/key-metrics-compare'
import { isCompareReasonCode } from '@/lib/compare/reasonCodes'
import type { CompareReasonCode } from '@/lib/compare/reasonCodes'

/**
 * ZIP 파일에서 추출한 XBRL XML 캐시 (테스트 성능 최적화)
 * 같은 ZIP 파일 경로에 대해 추출 결과를 재사용
 */
const zipXmlCache = new Map<string, { xml: string; fileName: string; xmlHash: string }>()

/**
 * XBRL XML 파일 캐시 (테스트 성능 최적화)
 * 같은 XBRL 파일 경로에 대해 읽기 결과를 재사용
 */
const xbrlXmlCache = new Map<string, { xml: string; xmlHash: string }>()

/**
 * 문자열을 SHA256 해시로 변환
 */
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/**
 * XBRL XML 문자열로부터 Bundle 생성
 */
export function buildBundleFromXbrlXml(
  xml: string,
  companyName: string,
  ticker: string,
  fy: number,
  q: 1 | 2 | 3 | 4
): AnalysisBundle {
  // XBRL 파싱
  const parser = createXBRLParser(xml, 'KR')
  const missingFields: string[] = []
  const financialStatement = parser.parseFinancialStatement(
    companyName,
    ticker,
    fy,
    q,
    missingFields
  )

  // FileParseResult 생성
  const parseResult: FileParseResult = {
    success: true,
    financialStatement,
    xmlContent: xml,
    fileName: `${companyName}_${fy}_Q${q}.xbrl`,
    missingFields,
  }

  // UploadedFile 스텁 생성
  const uploadedFile: UploadedFile = {
    id: 'file-0',
    file: {
      name: `${companyName}_${fy}_Q${q}.xbrl`,
    } as File,
    type: 'xbrl',
  }

  // buildAnalysisBundle 호출
  const bundle = buildAnalysisBundle(
    [parseResult],
    [uploadedFile],
    companyName,
    ticker
  )

  return bundle
}

/**
 * ZIP 파일 경로로부터 Bundle 생성 (캐시 사용)
 */
export async function buildBundleFromZip(
  zipPath: string,
  companyName: string,
  ticker: string,
  fy: number,
  q: 1 | 2 | 3 | 4
): Promise<AnalysisBundle> {
  // 캐시 확인: 같은 ZIP 파일 경로에 대해 추출 결과 재사용
  if (zipXmlCache.has(zipPath)) {
    const cached = zipXmlCache.get(zipPath)!
    // 캐시된 XML로 bundle 생성 (추출 없이 빠르게 처리)
    return buildBundleFromXbrlXml(
      cached.xml,
      companyName,
      ticker,
      fy,
      q
    )
  }

  // 캐시 없음: ZIP 파일에서 인스턴스 XBRL 파일 추출 (최초 1회만)
  const zipBuffer = readFileSync(zipPath)
  const blob = new Blob([zipBuffer], { type: 'application/zip' })
  const zipFile = new File([blob], 'test.zip', { type: 'application/zip' })

  // ZIP에서 인스턴스 XBRL 파일 추출
  const extractedFile = await extractXBRLFromZip(zipFile)
  if (!extractedFile) {
    throw new Error('ZIP에서 인스턴스 XBRL 파일을 추출할 수 없습니다.')
  }

  // 추출된 파일 내용 읽기
  const extractedContentBuffer = await extractedFile.arrayBuffer()
  const extractedContent = new TextDecoder('utf-8').decode(extractedContentBuffer)

  // XML 해시 계산
  const xmlHash = sha256(extractedContent)

  // 캐시에 저장 (다음 호출 시 재사용)
  zipXmlCache.set(zipPath, {
    xml: extractedContent,
    fileName: extractedFile.name,
    xmlHash,
  })

  // 캐시된 XML로 bundle 생성
  return buildBundleFromXbrlXml(
    extractedContent,
    companyName,
    ticker,
    fy,
    q
  )
}

/**
 * ZIP 파일에서 XBRL XML 해시 추출 (파싱 없이 해시만)
 * zipXmlCache 활용
 */
export async function extractXbrlXmlHashFromZip(
  zipPath: string
): Promise<{ xmlHash: string; fileName: string }> {
  // 캐시 확인: 같은 ZIP 파일 경로에 대해 추출 결과 재사용
  if (zipXmlCache.has(zipPath)) {
    const cached = zipXmlCache.get(zipPath)!
    return { xmlHash: cached.xmlHash, fileName: cached.fileName }
  }

  // 캐시 없음: ZIP 파일에서 인스턴스 XBRL 파일 추출 (최초 1회만)
  const zipBuffer = readFileSync(zipPath)
  const blob = new Blob([zipBuffer], { type: 'application/zip' })
  const zipFile = new File([blob], 'test.zip', { type: 'application/zip' })

  // ZIP에서 인스턴스 XBRL 파일 추출
  const extractedFile = await extractXBRLFromZip(zipFile)
  if (!extractedFile) {
    throw new Error('ZIP에서 인스턴스 XBRL 파일을 추출할 수 없습니다.')
  }

  // 추출된 파일 내용 읽기
  const extractedContentBuffer = await extractedFile.arrayBuffer()
  const extractedContent = new TextDecoder('utf-8').decode(extractedContentBuffer)

  // XML 해시 계산
  const xmlHash = sha256(extractedContent)

  // zipXmlCache에 저장 (다음 호출 시 재사용)
  zipXmlCache.set(zipPath, {
    xml: extractedContent,
    fileName: extractedFile.name,
    xmlHash,
  })

  return { xmlHash, fileName: extractedFile.name }
}

/**
 * Fixture 파일 경로에서 XBRL XML 로드 (캐시 사용)
 * XBRL 파일(.xbrl)과 ZIP 파일(.zip) 모두 지원
 */
export async function loadXbrlXmlFromFixture(
  fixturePath: string
): Promise<{ xml: string; xmlHash: string }> {
  // XBRL 파일인 경우
  if (fixturePath.endsWith('.xbrl')) {
    // 캐시 확인
    if (xbrlXmlCache.has(fixturePath)) {
      const cached = xbrlXmlCache.get(fixturePath)!
      return { xml: cached.xml, xmlHash: cached.xmlHash }
    }

    // 캐시 없음: 파일 읽기 (최초 1회만)
    const xmlContent = readFileSync(fixturePath, 'utf-8')
    const xmlHash = sha256(xmlContent)

    // 캐시에 저장 (다음 호출 시 재사용)
    xbrlXmlCache.set(fixturePath, {
      xml: xmlContent,
      xmlHash,
    })

    return { xml: xmlContent, xmlHash }
  }

  // ZIP 파일인 경우: 기존 zipXmlCache 활용
  if (fixturePath.endsWith('.zip')) {
    // 캐시 확인
    if (zipXmlCache.has(fixturePath)) {
      const cached = zipXmlCache.get(fixturePath)!
      return { xml: cached.xml, xmlHash: cached.xmlHash }
    }

    // 캐시 없음: ZIP 파일에서 인스턴스 XBRL 파일 추출 (최초 1회만)
    const zipBuffer = readFileSync(fixturePath)
    const blob = new Blob([zipBuffer], { type: 'application/zip' })
    const zipFile = new File([blob], 'test.zip', { type: 'application/zip' })

    // ZIP에서 인스턴스 XBRL 파일 추출
    const extractedFile = await extractXBRLFromZip(zipFile)
    if (!extractedFile) {
      throw new Error('ZIP에서 인스턴스 XBRL 파일을 추출할 수 없습니다.')
    }

    // 추출된 파일 내용 읽기
    const extractedContentBuffer = await extractedFile.arrayBuffer()
    const extractedContent = new TextDecoder('utf-8').decode(extractedContentBuffer)

    // XML 해시 계산
    const xmlHash = sha256(extractedContent)

    // zipXmlCache에 저장 (다음 호출 시 재사용)
    zipXmlCache.set(fixturePath, {
      xml: extractedContent,
      fileName: extractedFile.name,
      xmlHash,
    })

    return { xml: extractedContent, xmlHash }
  }

  throw new Error(`지원하지 않는 파일 형식입니다: ${fixturePath}`)
}

/**
 * Bundle에서 UI 카드 값 추출 (snapshot 대상 객체)
 */
export function extractUiCardSnapshot(bundle: AnalysisBundle): {
  period: {
    startDate: string
    endDate: string
    fiscalYear: number
    quarter: number
    periodType: string
  }
  revenue: number | undefined
  opm: number | undefined
  netMarginContinuing: number | undefined
  roe: number | undefined
  ocf: number | undefined
  capex: number | undefined
  fcf: number | undefined
  equity: number | undefined
  cash: number | undefined
  netDebt: number | undefined
  revenueYoY: number | undefined
  debtRatio: number | undefined
  policy: AnalysisBundle['meta']['calculationPolicy'] | undefined
} {
  const latestStatement = bundle.statements[0]

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
  const totalLiabilities = latestStatement.balance.totalLiabilities?.value
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
  // 부채비율(D/E) = (부채총계 / 자기자본) * 100
  const debtRatio = (totalLiabilities !== undefined && totalEquity !== undefined && totalEquity !== 0)
    ? (totalLiabilities / totalEquity) * 100
    : undefined

  // 정책 메타데이터
  const policy = bundle.meta?.calculationPolicy

  // 소수점 정밀도 조정 (snapshot 안정성)
  return {
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
    debtRatio: debtRatio !== undefined ? Number(debtRatio.toFixed(6)) : undefined,
    policy,
  }
}

/**
 * 핵심 지표 비교 검증 (가드레일)
 * 1) 핵심 지표 카드 11개 유지(키/개수 확인)
 * 2) compareBasis 값이 허용 집합인지 확인
 * 3) compareBasis="NONE"이면 reasonCode 필수 + reasonCodes.ts의 집합에 포함되는지 확인
 */
export function validateKeyMetricsCompare(bundle: AnalysisBundle): {
  pass: boolean
  errors: string[]
  unavailableMetrics: Array<{ key: string; reasonCode: CompareReasonCode | string | undefined }>
} {
  const errors: string[] = []
  const unavailableMetrics: Array<{ key: string; reasonCode: CompareReasonCode | string | undefined }> = []
  
  const latestStatement = bundle.statements[0]
  const keyMetricsCompare: KeyMetricsCompare | undefined = latestStatement?.keyMetricsCompare

  if (!keyMetricsCompare) {
    errors.push('keyMetricsCompare가 없습니다.')
    return { pass: false, errors, unavailableMetrics }
  }

  // 허용된 compareBasis 값
  const allowedCompareBasis = ['YOY', 'VS_PRIOR_END', 'QOQ', 'NONE'] as const
  
  // 핵심 지표 12개 정의
  const expectedMetrics: Array<{ key: keyof KeyMetricsCompare; label: string }> = [
    { key: 'revenue', label: '매출액' },
    { key: 'operatingMargin', label: '영업이익률' },
    { key: 'netMargin', label: '순이익률' },
    { key: 'roe', label: 'ROE' },
    { key: 'ocf', label: '영업현금흐름' },
    { key: 'equity', label: '자기자본' },
    { key: 'capex', label: 'CAPEX' },
    { key: 'fcf', label: 'FCF' },
    { key: 'cash', label: '현금및현금성자산' },
    { key: 'netCash', label: '순차입금/순현금' },
    { key: 'revenueYoY', label: '매출 성장률(YoY)' },
    { key: 'debtRatio', label: '부채비율(D/E)' },
  ]

  // 1) 핵심 지표 카드 11개 유지 확인
  const actualKeys = Object.keys(keyMetricsCompare).filter(key => keyMetricsCompare[key as keyof KeyMetricsCompare] !== undefined)
  if (actualKeys.length !== expectedMetrics.length) {
    errors.push(`핵심 지표 개수 불일치: 예상 ${expectedMetrics.length}개, 실제 ${actualKeys.length}개`)
  }

  // 2) 각 지표 검증
  for (const { key, label } of expectedMetrics) {
    const compare = keyMetricsCompare[key]
    
    if (!compare) {
      errors.push(`${label}(${key}): keyMetricsCompare에 없습니다.`)
      continue
    }

    // compareBasis 값이 허용 집합인지 확인
    if (!allowedCompareBasis.includes(compare.compareBasis as any)) {
      errors.push(`${label}(${key}): compareBasis='${compare.compareBasis}'는 허용되지 않은 값입니다. 허용값: ${allowedCompareBasis.join(', ')}`)
    }

    // compareBasis="NONE"이면 reasonCode 필수
    if (compare.compareBasis === 'NONE') {
      unavailableMetrics.push({ key, reasonCode: compare.reasonCode })
      
      if (!compare.reasonCode) {
        errors.push(`${label}(${key}): compareBasis='NONE'인데 reasonCode가 없습니다.`)
      } else if (!isCompareReasonCode(compare.reasonCode)) {
        errors.push(`${label}(${key}): reasonCode='${compare.reasonCode}'는 표준화된 CompareReasonCode가 아닙니다.`)
      }
    }
  }

  return {
    pass: errors.length === 0,
    errors,
    unavailableMetrics,
  }
}

/**
 * 비교불가 과다 FAIL 헬퍼 (2단계 적용)
 * 1단계: unavailableCount를 FAIL로 걸지 말고, 대신 "UNAVAILABLE가 발생한 카드 목록/사유"를 반환
 * 2단계(전기말/전년동기 추출 잠금 완료 후): MAX_UNAVAILABLE 임계치를 넣어 FAIL로 전환
 */
export function reportUnavailableMetrics(
  unavailableMetrics: Array<{ key: string; reasonCode: CompareReasonCode | string | undefined }>,
  maxUnavailable?: number
): {
  pass: boolean
  message: string
  count: number
} {
  const count = unavailableMetrics.length
  const message = unavailableMetrics.length > 0
    ? `UNAVAILABLE 지표 (${count}개):\n${unavailableMetrics.map(m => `  - ${m.key}: reasonCode=${m.reasonCode || 'N/A'}`).join('\n')}`
    : 'UNAVAILABLE 지표 없음'

  // 2단계: maxUnavailable이 설정되어 있으면 임계치 검사
  const pass = maxUnavailable === undefined || count <= maxUnavailable

  return { pass, message, count }
}

/**
 * 핵심 지표 비교 가드레일 검증 (회귀 방지)
 * 1) 11개 키 존재 확인
 * 2) compareBasis 허용값 확인
 * 3) NONE이면 reasonCode 필수 확인
 * 4) 비교불가 과다 감지 (MAX_NONE 임계치)
 * 
 * TODO(2차 강화): 전년동기 순이익(netIncomePrevYear) 추출이 고정된 뒤에만 아래를 활성화:
 * - MAX_NONE를 1로 낮춤 (roe만 NONE 허용)
 * - netMargin compareBasis를 'YOY'로 expect 잠금
 */
export function assertKeyMetricsCompareGuardrail(
  bundle: AnalysisBundle,
  options: { maxNone?: number } = {}
): {
  pass: boolean
  errors: string[]
  noneCount: number
  noneMetrics: Array<{ key: string; reasonCode: CompareReasonCode | string | undefined }>
} {
  const { maxNone } = options
  const validation = validateKeyMetricsCompare(bundle)
  
  const errors = [...validation.errors]
  const noneMetrics = validation.unavailableMetrics
  const noneCount = noneMetrics.length

  // 비교불가 과다 감지 (1차 잠금: MAX_NONE=2)
  // TODO(2차 강화): netIncomePrevYear 추출 고정 후 MAX_NONE=1로 강화
  if (maxNone !== undefined && noneCount > maxNone) {
    const noneList = noneMetrics.map(m => `  - ${m.key}: reasonCode=${m.reasonCode || 'N/A'}`).join('\n')
    errors.push(
      `비교불가 과다: ${noneCount}개 (임계치: ${maxNone}개)\n` +
      `NONE 항목 목록:\n${noneList}`
    )
  }

  return {
    pass: errors.length === 0,
    errors,
    noneCount,
    noneMetrics,
  }
}

/**
 * 기대 compareBasis "현재 기준" 잠금
 * 특정 지표들이 반드시 특정 compareBasis를 가져야 함을 검증
 */
export function assertExpectedCompareBasis(
  bundle: AnalysisBundle,
  expectedBasis: Partial<Record<keyof KeyMetricsCompare, 'YOY' | 'VS_PRIOR_END' | 'QOQ' | 'NONE'>>
): {
  pass: boolean
  errors: string[]
} {
  const errors: string[] = []
  const latestStatement = bundle.statements[0]
  const keyMetricsCompare = latestStatement?.keyMetricsCompare

  if (!keyMetricsCompare) {
    errors.push('keyMetricsCompare가 없습니다.')
    return { pass: false, errors }
  }

  for (const [key, expected] of Object.entries(expectedBasis)) {
    const compare = keyMetricsCompare[key as keyof KeyMetricsCompare]
    if (!compare) {
      errors.push(`${key}: keyMetricsCompare에 없습니다.`)
      continue
    }

    if (compare.compareBasis !== expected) {
      errors.push(
        `${key}: compareBasis='${compare.compareBasis}' (예상: '${expected}')`
      )
    }
  }

  return {
    pass: errors.length === 0,
    errors,
  }
}
