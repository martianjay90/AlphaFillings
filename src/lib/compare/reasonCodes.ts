/**
 * 비교 불가 이유 코드 표준화
 * UI/테스트가 공통으로 사용하는 단일 소스
 */

/**
 * 비교 기준 배지 타입
 */
export type CompareBasisBadge = 'YOY' | 'PRIOR_END' | 'QOQ' | 'UNAVAILABLE'

/**
 * 비교 불가 이유 코드
 */
export type CompareReasonCode =
  | 'MISSING_PREV_YEAR_VALUE'      // 전년동기 값 미확보
  | 'MISSING_PRIOR_END_INSTANT'    // 전기말 잔액 미확보
  | 'MISSING_CURRENT_VALUE'        // 현재 값 미확보
  | 'SCOPE_MISMATCH'                // 스코프 불일치 (예: 계속영업 vs 총계)
  | 'UNIT_MISMATCH'                // 단위 불일치
  | 'PERIOD_MISMATCH'               // 기간 매칭 실패
  | 'MULTIPLE_CANDIDATES'           // 후보가 너무 많아 선택 불가
  | 'PARSER_ERROR'                  // 파서 오류
  | 'NOT_APPLICABLE'                // 해당 없음

/**
 * CompareReasonCode 타입 가드
 */
export function isCompareReasonCode(x: unknown): x is CompareReasonCode {
  if (typeof x !== 'string') return false
  const validCodes: CompareReasonCode[] = [
    'MISSING_PREV_YEAR_VALUE',
    'MISSING_PRIOR_END_INSTANT',
    'MISSING_CURRENT_VALUE',
    'SCOPE_MISMATCH',
    'UNIT_MISMATCH',
    'PERIOD_MISMATCH',
    'MULTIPLE_CANDIDATES',
    'PARSER_ERROR',
    'NOT_APPLICABLE',
  ]
  return validCodes.includes(x as CompareReasonCode)
}

/**
 * 비교 불가 이유 한글 포맷
 * @param code 이유 코드
 * @param ctx 선택적 컨텍스트 (metricLabel, anchorDate 등)
 * @returns 한글 문구
 */
export function formatCompareReasonKOR(
  code: CompareReasonCode,
  ctx?: { metricLabel?: string; anchorDate?: string }
): string {
  switch (code) {
    case 'MISSING_PREV_YEAR_VALUE':
      return '전년동기 값 미확보'
    case 'MISSING_PRIOR_END_INSTANT':
      return '전기말 잔액 미확보'
    case 'MISSING_CURRENT_VALUE':
      return '현재 값 미확보'
    case 'SCOPE_MISMATCH':
      return '스코프 불일치'
    case 'UNIT_MISMATCH':
      return '단위 불일치'
    case 'PERIOD_MISMATCH':
      return '기간 매칭 실패'
    case 'MULTIPLE_CANDIDATES':
      return '후보가 너무 많음'
    case 'PARSER_ERROR':
      return '파서 오류'
    case 'NOT_APPLICABLE':
      return '해당 없음'
    default:
      // 타입 안전성을 위한 exhaustive check
      const _exhaustive: never = code
      return '알 수 없는 오류'
  }
}

/**
 * 기존 CompareBasis를 CompareBasisBadge로 변환
 * (향후 마이그레이션용 유틸리티)
 */
export function toCompareBasisBadge(basis: 'YOY' | 'VS_PRIOR_END' | 'QOQ' | 'NONE'): CompareBasisBadge {
  switch (basis) {
    case 'YOY':
      return 'YOY'
    case 'VS_PRIOR_END':
      return 'PRIOR_END'
    case 'QOQ':
      return 'QOQ'
    case 'NONE':
      return 'UNAVAILABLE'
    default:
      return 'UNAVAILABLE'
  }
}
