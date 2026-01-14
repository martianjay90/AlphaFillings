/**
 * 테이블 기반 스모크 테스트
 * fixtures 배열에 회사/파일만 추가하면 자동으로 검증하는 구조
 */

/**
 * @jest-environment jsdom
 */

import { describe, test, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { buildBundleFromXbrlXml, loadXbrlXmlFromFixture, extractUiCardSnapshot, extractXbrlXmlHashFromZip } from './helpers/smokeHarness'
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
 * Fixtures 배열 (회사/파일 추가 시 여기에 1줄만 추가)
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
  {
    name: 'SAMSUNG_Q3_2025_XBRL',
    kind: 'xbrl',
    path: 'fixtures/filings/samsung/entity00126380_2025-09-30.xbrl',
    companyName: '삼성전자',
    ticker: '005930',
    fy: 2025,
    q: 3,
  },
  {
    name: 'SAMSUNG_Q3_2025_ZIP',
    kind: 'zip',
    path: 'fixtures/filings/samsung/samsung_2025-09-30.zip',
    companyName: '삼성전자',
    ticker: '005930',
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

describe('스모크 테스트 (테이블 기반)', () => {
  // 전역 타임아웃 설정 (ZIP 파일 처리 시간 고려)
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

        // runId 정규화 후 해시 생성
        const normalized = normalizeBundle(bundle)
        const jsonString = stableStringify(normalized)
        const hash = sha256(jsonString)
        hashes.push(hash)

        // 1회차: bundle 저장 (스냅샷용)
        if (i === 0) {
          firstBundle = bundle
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
