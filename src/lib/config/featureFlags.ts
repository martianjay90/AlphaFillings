/**
 * Feature Flags
 * 개발/디버깅용 기능 플래그 관리
 */

/**
 * Step1 Evidence Audit 기능 플래그
 * 내부 진단용 로그/JSON 출력 (사용자 출력 미노출)
 * 
 * 환경 변수 (우선순위 순):
 * 1. NEXT_PUBLIC_FEATURE_STEP1_EVIDENCE_AUDIT (클라이언트/서버 모두 접근 가능)
 * 2. FEATURE_STEP1_EVIDENCE_AUDIT (서버 사이드만 접근 가능)
 * 
 * 기본값: false
 * 
 * 설정 방법:
 * 1. 프로젝트 루트에 .env.local 파일 생성
 * 2. NEXT_PUBLIC_FEATURE_STEP1_EVIDENCE_AUDIT=true 추가
 * 3. dev 서버 재시작
 */
export function isStep1EvidenceAuditEnabled(): boolean {
  try {
    if (typeof process !== 'undefined' && process.env) {
      // 우선순위 1: NEXT_PUBLIC_ 접두사 (클라이언트/서버 모두 접근 가능)
      const publicValue = process.env.NEXT_PUBLIC_FEATURE_STEP1_EVIDENCE_AUDIT
      if (publicValue === 'true' || publicValue === '1') {
        return true
      }
      
      // 우선순위 2: 일반 환경 변수 (서버 사이드만 접근 가능)
      const serverValue = process.env.FEATURE_STEP1_EVIDENCE_AUDIT
      if (serverValue === 'true' || serverValue === '1') {
        return true
      }
    }
  } catch (error) {
    // 환경 변수 접근 실패 시 false 반환
    console.warn('[FEATURE_FLAG] Failed to read FEATURE_STEP1_EVIDENCE_AUDIT:', error)
  }
  return false
}
