/**
 * Self-Check 모듈
 * AnalysisBundle의 무결성을 검증하는 공통 체크
 */

import type { AnalysisBundle, PeriodKey, DerivedMetrics } from '@/types/analysis-bundle'

/**
 * Self-Check 결과
 */
export interface SelfCheckResult {
  /** PASS 여부 */
  pass: boolean
  
  /** 요약 메시지 */
  summary: string
  
  /** 실패 항목 목록 */
  failures: string[]
  
  /** 경고 항목 목록 */
  warnings: string[]
}

/**
 * 기간 무결성 검증
 * A) startDate/endDate 존재, start <= end
 * B) 연도 sanity: 2000~2100 밖이면 FAIL
 */
function checkPeriodIntegrity(period: PeriodKey): { failures: string[]; warnings: string[] } {
  const failures: string[] = []
  const warnings: string[] = []

  // A) startDate/endDate 존재 및 start <= end 검증
  if (period.startDate && period.endDate) {
    const startDate = new Date(period.startDate)
    const endDate = new Date(period.endDate)
    
    if (isNaN(startDate.getTime())) {
      failures.push(`기간 무결성: startDate가 유효하지 않은 날짜입니다 (${period.startDate})`)
    } else if (isNaN(endDate.getTime())) {
      failures.push(`기간 무결성: endDate가 유효하지 않은 날짜입니다 (${period.endDate})`)
    } else if (startDate > endDate) {
      failures.push(`기간 무결성: startDate(${period.startDate})가 endDate(${period.endDate})보다 늦습니다`)
    }
  } else if (period.endDate) {
    // 재무상태표(instant)의 경우 endDate만 있어도 됨
    const endDate = new Date(period.endDate)
    if (isNaN(endDate.getTime())) {
      failures.push(`기간 무결성: endDate가 유효하지 않은 날짜입니다 (${period.endDate})`)
    }
  } else {
    // endDate가 없으면 FAIL
    failures.push('기간 무결성: endDate가 존재하지 않습니다')
  }

  // B) 연도 sanity: 2000~2100 밖이면 FAIL
  if (period.fiscalYear !== undefined && period.fiscalYear !== null) {
    if (period.fiscalYear < 2000 || period.fiscalYear > 2100) {
      failures.push(`기간 무결성: fiscalYear(${period.fiscalYear})가 허용 범위(2000~2100)를 벗어났습니다`)
    }
  }

  // endDate에서 연도 추출하여 검증 (fiscalYear가 없는 경우 대비)
  if (period.endDate) {
    const endDate = new Date(period.endDate)
    if (!isNaN(endDate.getTime())) {
      const year = endDate.getFullYear()
      if (year < 2000 || year > 2100) {
        failures.push(`기간 무결성: endDate의 연도(${year})가 허용 범위(2000~2100)를 벗어났습니다`)
      }
    }
  }

  return { failures, warnings }
}

/**
 * 산술 무결성 검증
 * ocf/capex/fcf가 있으면 fcf == ocf - capex (가능할 때만)
 */
function checkArithmeticIntegrity(derived: DerivedMetrics[]): { failures: string[]; warnings: string[] } {
  const failures: string[] = []
  const warnings: string[] = []

  for (let i = 0; i < derived.length; i++) {
    const metrics = derived[i]
    const ocf = metrics.ocf
    const capex = metrics.capex
    const fcf = metrics.fcf

    // 세 값이 모두 존재하는 경우만 검증
    if (ocf !== undefined && ocf !== null && 
        capex !== undefined && capex !== null && 
        fcf !== undefined && fcf !== null) {
      
      // FCF = OCF - CAPEX 검증
      // 부동소수점 오차 허용 (0.01% 또는 최소 1000)
      const expectedFcf = ocf - capex
      const tolerance = Math.max(Math.abs(expectedFcf) * 0.0001, 1000)
      const diff = Math.abs(fcf - expectedFcf)
      
      if (diff > tolerance) {
        failures.push(
          `산술 무결성 (derived[${i}]): FCF(${fcf}) != OCF(${ocf}) - CAPEX(${capex}) = ${expectedFcf} (차이: ${diff.toFixed(2)})`
        )
      }
    }
  }

  return { failures, warnings }
}

/**
 * AnalysisBundle 무결성 검증
 * 
 * 필수 체크:
 * A) 기간 무결성: startDate/endDate 존재, start <= end, 연도 sanity (2000~2100)
 * B) 산술 무결성: ocf/capex/fcf가 있으면 fcf == ocf - capex
 */
export function runSelfCheck(bundle: AnalysisBundle): SelfCheckResult {
  const failures: string[] = []
  const warnings: string[] = []

  // A) 기간 무결성 검증
  const periodCheck = checkPeriodIntegrity(bundle.period)
  failures.push(...periodCheck.failures)
  warnings.push(...periodCheck.warnings)

  // 각 statement의 period도 검증 (선택적)
  for (let i = 0; i < bundle.statements.length; i++) {
    const statementPeriod = bundle.statements[i].period
    const statementPeriodCheck = checkPeriodIntegrity(statementPeriod)
    // statement period는 경고로 처리 (대표 period가 더 중요)
    if (statementPeriodCheck.failures.length > 0) {
      warnings.push(`Statement[${i}].period: ${statementPeriodCheck.failures.join(', ')}`)
    }
  }

  // B) 산술 무결성 검증
  const arithmeticCheck = checkArithmeticIntegrity(bundle.derived)
  failures.push(...arithmeticCheck.failures)
  warnings.push(...arithmeticCheck.warnings)

  // 결과 판정
  const pass = failures.length === 0
  const summary = pass
    ? `Self-Check PASS (${bundle.statements.length} statements, ${bundle.derived.length} derived metrics)`
    : `Self-Check FAIL: ${failures.length} failure(s), ${warnings.length} warning(s)`

  return {
    pass,
    summary,
    failures,
    warnings,
  }
}
