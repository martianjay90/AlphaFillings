/**
 * 스케줄러 유틸리티
 * 주기적인 작업 실행 관리
 */

import { getCompanyRegistry } from '@/lib/parsers/company-registry';

/**
 * 회사 리스트 자동 업데이트 체크 및 실행
 * 앱 초기화 시 또는 주기적으로 호출
 */
export async function checkAndUpdateCompanyList(): Promise<{
  updated: boolean;
  message: string;
}> {
  try {
    const registry = getCompanyRegistry();
    const needsUpdate = await registry.needsUpdate();
    
    if (!needsUpdate) {
      return {
        updated: false,
        message: '회사 리스트가 최신 상태입니다.',
      };
    }

    // 업데이트 실행
    await registry.initializeOrUpdate();
    
    return {
      updated: true,
      message: '회사 리스트가 업데이트되었습니다.',
    };
  } catch (error) {
    console.error('회사 리스트 업데이트 실패:', error);
    return {
      updated: false,
      message: error instanceof Error ? error.message : '업데이트 실패',
    };
  }
}

/**
 * 백그라운드에서 주기적으로 업데이트 체크
 * (클라이언트 사이드에서만 실행)
 */
export function startBackgroundUpdateCheck(intervalMinutes: number = 60): () => void {
  if (typeof window === 'undefined') {
    // 서버 사이드에서는 실행하지 않음
    return () => {};
  }

  const intervalId = setInterval(async () => {
    await checkAndUpdateCompanyList();
  }, intervalMinutes * 60 * 1000);

  // 초기 실행
  checkAndUpdateCompanyList();

  // 정리 함수 반환
  return () => clearInterval(intervalId);
}
