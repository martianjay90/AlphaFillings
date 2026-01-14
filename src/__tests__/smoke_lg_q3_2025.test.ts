/**
 * 스모크 테스트: LG전자 2025-09-30 XBRL
 * period 튐(2032), KPI 누락, FCF 산술 오류를 자동으로 잡는다
 * 3회 반복 검증으로 재현성 확인
 */

import { describe, test, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { createXBRLParser } from '@/lib/parsers/xbrl-parser'
import { buildAnalysisBundle } from '@/lib/analysis/analysis-bundle-builder'
import { runSelfCheck } from '@/lib/analysis/self-check'
import type { FileParseResult } from '@/lib/parsers/file-parser'
import type { UploadedFile } from '@/components/file-dropzone'
import type { AnalysisBundle } from '@/types/analysis-bundle'

/**
 * XBRL 파일 경로
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
 * XBRL 파일을 읽어서 Bundle 생성
 */
function buildBundle(): AnalysisBundle {
  // XBRL 파일 읽기
  const xbrlContent = readFileSync(XBRL_FILE_PATH, 'utf-8')

  // 1) XBRL 파싱
  const parser = createXBRLParser(xbrlContent, 'KR')
  const missingFields: string[] = []
  const financialStatement = parser.parseFinancialStatement(
    'LG전자',
    '066570',
    2025,
    3, // Q3
    missingFields
  )

  // 2) FileParseResult 생성
  const parseResult: FileParseResult = {
    success: true,
    financialStatement,
    xmlContent: xbrlContent,
    fileName: 'entity00401731_2025-09-30.xbrl',
    missingFields,
  }

  // 3) UploadedFile 스텁 생성
  const uploadedFile: UploadedFile = {
    id: 'file-0',
    file: {
      name: 'entity00401731_2025-09-30.xbrl',
    } as File,
    type: 'xbrl',
  }

  // 4) buildAnalysisBundle 호출
  const bundle = buildAnalysisBundle(
    [parseResult],
    [uploadedFile],
    'LG전자',
    '066570'
  )

  return bundle
}

describe('스모크 테스트: LG전자 Q3 2025', () => {
  test('XBRL 파싱 → bundle 생성 → self-check PASS (3회 반복 검증)', () => {
    // XBRL 파일 존재 여부 확인
    try {
      readFileSync(XBRL_FILE_PATH, 'utf-8')
    } catch (error) {
      // 환경변수로 스킵 허용 (로컬 편의용)
      const allowSkip = process.env.SMOKE_ALLOW_SKIP === '1'
      if (allowSkip) {
        console.warn(`[SmokeTest] XBRL 파일을 찾을 수 없습니다: ${XBRL_FILE_PATH}`)
        console.warn('[SmokeTest] SMOKE_ALLOW_SKIP=1이 설정되어 있어 테스트를 스킵합니다.')
        console.warn('[SmokeTest] LG전자 XBRL ZIP에서 entity00401731_2025-09-30.xbrl 파일을 추출하여 위 경로에 저장하세요.')
        expect(true).toBe(true) // 테스트 스킵 (항상 PASS)
        return
      } else {
        // 기본 동작: fixture 누락 시 FAIL (회귀 방지)
        console.error(`[SmokeTest] XBRL 파일을 찾을 수 없습니다: ${XBRL_FILE_PATH}`)
        console.error('[SmokeTest] LG전자 XBRL ZIP에서 entity00401731_2025-09-30.xbrl 파일을 추출하여 위 경로에 저장하세요.')
        console.error('[SmokeTest] 로컬 편의를 위해 스킵하려면 SMOKE_ALLOW_SKIP=1 환경변수를 설정하세요.')
        throw new Error(`Required fixture file not found: ${XBRL_FILE_PATH}`)
      }
    }

    // 3회 반복 검증
    const hashes: string[] = []
    for (let i = 0; i < 3; i++) {
      // Bundle 생성
      const bundle = buildBundle()

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

    // LG 샘플 고정 assert 검증 (1회 실행 결과 사용)
    const bundle = buildBundle()
    const latestStatement = bundle.statements[0]

    // 기간 검증
    expect(bundle.period.startDate).toBe('2025-01-01')
    expect(bundle.period.endDate).toBe('2025-09-30')
    expect(bundle.period.fiscalYear).toBe(2025)
    expect(bundle.period.quarter).toBe(3)
    expect(bundle.period.periodType).toBe('YTD')

    // EPS(계속영업) 검증
    const eps = latestStatement.income.eps?.value
    expect(eps).toBe(9961)

    // 순이익(계속영업) 검증
    const netIncome = latestStatement.income.netIncome?.value
    expect(netIncome).toBe(1_951_820_000_000)

    // OCF 검증
    const ocf = latestStatement.cashflow.operatingCashFlow?.value
    expect(ocf).toBe(3_670_350_000_000)

    // CAPEX PPE 검증
    const capexPPE = latestStatement.cashflow.capexPPE?.value
    expect(capexPPE).toBe(1_850_073_000_000)

    // CAPEX Intangible 검증
    const capexIntangible = latestStatement.cashflow.capexIntangible?.value
    expect(capexIntangible).toBe(859_960_000_000)

    // 정책 결과 CAPEX(PPE_ONLY) 검증
    const capitalExpenditure = latestStatement.cashflow.capitalExpenditure?.value
    expect(capitalExpenditure).toBe(1_850_073_000_000)

    // FCF 검증
    const fcf = latestStatement.cashflow.freeCashFlow?.value
    expect(fcf).toBe(1_820_277_000_000)

    // 추가 지표 검증 (현금, 순차입금/순현금, 매출 성장률)
    const cash = latestStatement.balance.cash?.value
    const debt = latestStatement.balance.interestBearingDebt?.value
    const revenuePrevYear = latestStatement.income.revenuePrevYear?.value
    const revenue = latestStatement.income.revenue?.value
    
    // netDebt = debt - cash
    const netDebt = (cash !== undefined && debt !== undefined)
      ? debt - cash
      : undefined
    
    // revenueYoY = ((revenue - revenuePrevYear) / revenuePrevYear) * 100
    const revenueYoY = (revenuePrevYear !== undefined && revenuePrevYear !== null && revenuePrevYear > 0 && revenue !== undefined)
      ? ((revenue - revenuePrevYear) / revenuePrevYear) * 100
      : undefined
    
    // 5개 값을 하나의 객체로 묶어서 inline snapshot으로 검증
    expect({
  cash,
  debt,
  revenuePrevYear,
  netDebt,
  revenueYoY: revenueYoY !== undefined ? Number(revenueYoY.toFixed(6)) : undefined
}).toMatchInlineSnapshot(`
{
  "cash": 7958078000000,
  "debt": 13120715000000,
  "netDebt": 5162637000000,
  "revenuePrevYear": 64966707000000,
  "revenueYoY": 0.588026,
}
`)

    // 계산 정책 메타데이터 검증
    expect(bundle.meta).toBeDefined()
    expect(bundle.meta?.calculationPolicy).toBeDefined()
    const policy = bundle.meta!.calculationPolicy
    expect(policy.capexPolicy).toBe('PPE_ONLY')
    expect(policy.epsScope).toBe('CONTINUING')
    expect(policy.roeDefinition).toBe('CUMULATIVE_END_EQUITY')
    expect(policy.fcfDefinition).toBe('OCF_MINUS_CAPEX')
    expect(policy.capexComponentsIncluded.ppe).toBe(true)
    expect(policy.capexComponentsIncluded.intangible).toBe(true)
  })
})
