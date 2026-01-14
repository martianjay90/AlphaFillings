"use client"

import { useEffect } from 'react'
import { startBackgroundUpdate } from '@/lib/utils/background-updater'

/**
 * 회사 리스트 초기화 컴포넌트
 * 앱 로드 시 백그라운드에서 회사 리스트 업데이트 (분석에 영향 없음)
 * 백그라운드 업데이트 실패는 분석 파이프라인에 영향을 주지 않음
 */
export function CompanyListInitializer() {
  useEffect(() => {
    // 백그라운드에서 업데이트 시작 (분석 프로세스와 독립적)
    // 에러는 background-updater에서 이미 처리되므로 여기서는 조용히 실행
    startBackgroundUpdate().catch(() => {
      // background-updater에서 이미 로그가 출력되므로 여기서는 추가 로그 없음
      // 분석 파이프라인에 영향을 주지 않도록 에러를 throw하지 않음
    })
  }, [])

  // UI 렌더링 없음
  return null
}
