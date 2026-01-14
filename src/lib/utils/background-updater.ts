/**
 * 백그라운드 업데이트 유틸리티
 * 전체 기업 리스트 업데이트를 분석과 독립적으로 실행
 */

import { getCompanyRegistry } from '@/lib/parsers/company-registry';

/**
 * 백그라운드 업데이트 상태
 */
let backgroundUpdateRunning = false;
let backgroundUpdatePromise: Promise<void> | null = null;
let lastErrorLogTime: number = 0; // 마지막 에러 로그 시간 (디바운스용)
const ERROR_LOG_INTERVAL = 60000; // 1분에 1회만 로그

/**
 * 백그라운드에서 회사 리스트 업데이트 실행
 * 분석 프로세스에 영향을 주지 않도록 별도로 실행
 * 백그라운드 업데이트 실패는 분석 파이프라인에 영향을 주지 않음
 */
export async function startBackgroundUpdate(): Promise<void> {
  // 이미 실행 중이면 기존 Promise 반환
  if (backgroundUpdateRunning && backgroundUpdatePromise) {
    return backgroundUpdatePromise;
  }

  backgroundUpdateRunning = true;
  
  // 개발 모드에서만 로그 (프로덕션에서는 조용히 실행)
  if (process.env.NODE_ENV !== 'production') {
    console.info('[BackgroundUpdater] 백그라운드 업데이트 시작');
  }

  backgroundUpdatePromise = (async () => {
    try {
      const registry = getCompanyRegistry();
      
      // 진행률 콜백 없이 조용히 업데이트 (UI에 영향 없음)
      await registry.initializeOrUpdate();
      
      // 성공 로그는 개발 모드에서만
      if (process.env.NODE_ENV !== 'production') {
        console.info('[BackgroundUpdater] 백그라운드 업데이트 완료');
      }
    } catch (error) {
      // 에러는 분석 파이프라인에 영향을 주지 않도록 조용히 처리
      // 디바운스된 로그만 출력 (동일 오류 반복 방지)
      const now = Date.now();
      if (now - lastErrorLogTime > ERROR_LOG_INTERVAL) {
        lastErrorLogTime = now;
        
        // 404/401/403 등 백그라운드 기능 에러는 info 레벨로 처리
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isBackgroundError = 
          errorMessage.includes('404') ||
          errorMessage.includes('does not exist') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('권한') ||
          errorMessage.includes('인증');

        if (isBackgroundError) {
          // 백그라운드 기능 실패는 info 레벨 (콘솔 error 아님)
          if (process.env.NODE_ENV !== 'production') {
            console.info('[BackgroundUpdater] 백그라운드 업데이트 실패 (기능 비활성화됨, 분석에는 영향 없음):', errorMessage);
          }
        } else {
          // 그 외 예상치 못한 에러는 warn 레벨
          console.warn('[BackgroundUpdater] 백그라운드 업데이트 실패 (분석에는 영향 없음):', errorMessage);
        }
      }
      // 에러를 throw하지 않음 (분석 파이프라인에 영향을 주지 않도록)
    } finally {
      backgroundUpdateRunning = false;
      backgroundUpdatePromise = null;
    }
  })();

  return backgroundUpdatePromise;
}

/**
 * 백그라운드 업데이트가 실행 중인지 확인
 */
export function isBackgroundUpdateRunning(): boolean {
  return backgroundUpdateRunning;
}
