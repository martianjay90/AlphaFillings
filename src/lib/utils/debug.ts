/**
 * 디버그 로그 유틸리티
 * 환경변수로 로그 출력 제어
 */

/**
 * 디버그 모드 활성화 여부 확인
 * SMOKE_DEBUG=1 또는 XBRL_DEBUG=1 환경변수가 설정되어 있으면 true
 */
export const isDebug = (): boolean => {
  return process.env.SMOKE_DEBUG === '1' || process.env.XBRL_DEBUG === '1'
}

/**
 * 디버그 로그 출력 (환경변수가 설정된 경우에만)
 */
export const dlog = (...args: any[]): void => {
  if (isDebug()) {
    console.log(...args)
  }
}