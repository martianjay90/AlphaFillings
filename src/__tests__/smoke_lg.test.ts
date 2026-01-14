/**
 * LG전자 스모크 테스트
 * XBRL: 3회 반복 동일성 + UI 카드 snapshot
 * ZIP: XML 해시 검증만 (같은 회사의 XBRL fixture와 비교)
 */

/**
 * @jest-environment jsdom
 */

import { describe, test, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { buildBundleFromXbrlXml, loadXbrlXmlFromFixture, extractUiCardSnapshot, extractXbrlXmlHashFromZip, validateKeyMetricsCompare, reportUnavailableMetrics, assertKeyMetricsCompareGuardrail, assertExpectedCompareBasis } from './helpers/smokeHarness'
import { runSelfCheck } from '@/lib/analysis/self-check'
import type { AnalysisBundle } from '@/types/analysis-bundle'

/**
 * Fixture 정의 인터페이스
 */
interface SmokeFixture {
  name: string
  kind: 'xbrl' | 'zip'
  path: string
  companyName: string
  ticker: string
  fy: number
  q: 1 | 2 | 3 | 4
}

/**
 * LG전자 Fixtures
 */
const fixtures: SmokeFixture[] = [
  {
    name: 'LG_Q3_2025_XBRL',
    kind: 'xbrl',
    path: 'fixtures/filings/lg/entity00401731_2025-09-30.xbrl',
    companyName: 'LG전자',
    ticker: '066570',
    fy: 2025,
    q: 3,
  },
  {
    name: 'LG_Q3_2025_ZIP',
    kind: 'zip',
    path: 'fixtures/filings/lg/lg_2025-09-30.zip',
    companyName: 'LG전자',
    ticker: '066570',
    fy: 2025,
    q: 3,
  },
]

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

describe('스모크 테스트 (LG전자)', () => {
  // 전역 타임아웃 설정
  jest.setTimeout(120000)

  fixtures.forEach((fixture) => {
    test(`${fixture.name}: ${fixture.kind === 'zip' ? 'XML 해시 검증' : '3회 반복 동일성 + UI 카드 snapshot'}`, async () => {
      // Fixture 파일 경로
      const fixturePath = join(__dirname, '../..', fixture.path)

      // Fixture 파일 존재 여부 확인
      try {
        readFileSync(fixturePath)
      } catch (error) {
        // 환경변수로 스킵 허용 (로컬 편의용)
        const allowSkip = process.env.SMOKE_ALLOW_SKIP === '1'
        if (allowSkip) {
          console.warn(`[SmokeTest] Fixture 파일을 찾을 수 없습니다: ${fixturePath}`)
          console.warn('[SmokeTest] SMOKE_ALLOW_SKIP=1이 설정되어 있어 테스트를 스킵합니다.')
          expect(true).toBe(true) // 테스트 스킵 (항상 PASS)
          return
        } else {
          // 기본 동작: fixture 누락 시 FAIL (회귀 방지)
          console.error(`[SmokeTest] Fixture 파일을 찾을 수 없습니다: ${fixturePath}`)
          console.error('[SmokeTest] 로컬 편의를 위해 스킵하려면 SMOKE_ALLOW_SKIP=1 환경변수를 설정하세요.')
          throw new Error(`Required fixture file not found: ${fixturePath}`)
        }
      }

      // ZIP 케이스: 같은 회사의 XBRL fixture를 기준으로 해시 비교만 수행
      if (fixture.kind === 'zip') {
        // 같은 회사의 XBRL fixture 찾기
        const xbrlFixture = fixtures.find(
          f => f.kind === 'xbrl' && f.companyName === fixture.companyName && f.ticker === fixture.ticker && f.fy === fixture.fy && f.q === fixture.q
        )
        
        if (!xbrlFixture) {
          throw new Error(`같은 회사의 XBRL fixture를 찾을 수 없습니다: ${fixture.companyName} ${fixture.ticker} ${fixture.fy}Q${fixture.q}`)
        }

        // 기준 XBRL fixture의 XML 해시 계산
        const xbrlFixturePath = join(__dirname, '../..', xbrlFixture.path)
        const { xmlHash: xbrlXmlHash } = await loadXbrlXmlFromFixture(xbrlFixturePath)

        // ZIP에서 XML 해시 추출 (파싱 없이)
        const { xmlHash: zipXmlHash, fileName } = await extractXbrlXmlHashFromZip(fixturePath)

        // 해시 비교
        expect(zipXmlHash).toBe(xbrlXmlHash)
        expect(fileName).toMatch(/\.xbrl$/)

        return // ZIP 케이스는 여기서 종료 (파싱/스냅샷/3회 반복 생략)
      }

      // XBRL 케이스: 기존 로직 유지 (3회 반복 + 스냅샷)
      // Fixture 파일에서 XBRL XML 로드 (캐시 사용, 최초 1회만 읽기/추출)
      const { xml, xmlHash } = await loadXbrlXmlFromFixture(fixturePath)

      // 3회 반복 검증 (XML은 재사용, build만 반복)
      const hashes: string[] = []
      let firstBundle: AnalysisBundle | null = null
      
      for (let i = 0; i < 3; i++) {
        // Bundle 생성 (XML은 캐시된 것을 재사용)
        const bundle = buildBundleFromXbrlXml(
          xml,
          fixture.companyName,
          fixture.ticker,
          fixture.fy,
          fixture.q
        )

        // Self-Check 검증
        const selfCheckResult = runSelfCheck(bundle)
        expect(selfCheckResult.pass).toBe(true)

        // 핵심 지표 비교 가드레일 검증 (회귀 방지)
        const guardrail = assertKeyMetricsCompareGuardrail(bundle, { maxNone: 2 })
        if (!guardrail.pass) {
          throw new Error(`핵심 지표 가드레일 검증 실패:\n${guardrail.errors.join('\n')}`)
        }

        // 비교불가 과다 FAIL 잠금 (maxUnavailable = 2)
        // 기준 샘플에서 ROE, debtRatio 같은 구조적 비교불가 2개 정도 허용
        // TODO: 전기말 부채총계 추출이 완료되면 maxUnavailable = 1로 강화
        const unavailableReport = reportUnavailableMetrics(guardrail.noneMetrics, 2)
        if (!unavailableReport.pass) {
          throw new Error(`비교불가 과다: ${unavailableReport.message}`)
        }
        
        // 비교불가 리포트 (로깅)
        if (guardrail.noneCount > 0) {
          console.log(`[SmokeTest LG] ${unavailableReport.message}`)
        }

        // 기대 compareBasis "현재 기준" 잠금 (1차)
        // TODO(2차 강화): netIncomePrevYear 추출 고정 후 MAX_NONE=1, netMargin='YOY' 잠금
        const expectedBasis = {
          revenue: 'YOY' as const,
          operatingMargin: 'YOY' as const,
          ocf: 'YOY' as const,
          capex: 'YOY' as const,
          fcf: 'YOY' as const,
          revenueYoY: 'YOY' as const,
          equity: 'VS_PRIOR_END' as const,
          cash: 'VS_PRIOR_END' as const,
          netCash: 'VS_PRIOR_END' as const,
          // debtRatio: 부채총계+자기자본이 둘 다 잡히는 경우 VS_PRIOR_END, 아니면 NONE 허용 (단 reasonCode 필수)
          // netMargin, roe는 현재 NONE 허용 (단 reasonCode 필수)
        }
        const basisCheck = assertExpectedCompareBasis(bundle, expectedBasis)
        if (!basisCheck.pass) {
          throw new Error(`기대 compareBasis 검증 실패:\n${basisCheck.errors.join('\n')}`)
        }

        // runId 정규화 후 해시 생성
        const normalized = normalizeBundle(bundle)
        const jsonString = stableStringify(normalized)
        const hash = sha256(jsonString)
        hashes.push(hash)

        // 1회차: bundle 저장 (스냅샷용) 및 netIncomePrevYear/netMargin 검증
        if (i === 0) {
          firstBundle = bundle
          
          // netIncomePrevYear 존재 및 netMargin.compareBasis=YOY 검증
          const latest = firstBundle.statements[0]
          const netIncomePrevYear = latest.income.netIncomePrevYear?.value
          expect(netIncomePrevYear).toBeDefined()
          expect(typeof netIncomePrevYear).toBe('number')
          
          const netMarginCompare = firstBundle.statements[0].keyMetricsCompare?.netMargin
          expect(netMarginCompare).toBeDefined()
          expect(netMarginCompare?.compareBasis).toBe('YOY')
        }
      }

      // 3개 해시가 모두 동일해야 PASS
      expect(hashes[0]).toBe(hashes[1])
      expect(hashes[1]).toBe(hashes[2])
      expect(hashes[0]).toBe(hashes[2])

      // 1회차 bundle로 UI 카드 값 snapshot 검증 (1회만 수행)
      if (firstBundle) {
        const snapshot = extractUiCardSnapshot(firstBundle)
        expect(snapshot).toMatchSnapshot()
      }
    })
  })
})
