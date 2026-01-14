/**
 * 핵심 지표 비교 타입 정의
 * compareBasis/trend/prevValue/delta 관련 타입
 */

import type { CompareBasisBadge, CompareReasonCode } from '@/lib/compare/reasonCodes'

export type CompareBasis = 'YOY' | 'VS_PRIOR_END' | 'QOQ' | 'NONE'
export type Trend = 'up' | 'down' | 'neutral'

/**
 * 표준화된 비교 메트릭 인터페이스
 * 최소 침습 원칙: 기존 필드는 유지하고 표준 타입 추가
 */
export interface KeyMetricCompare {
  /** 비교 기준 (기존 타입 유지, 향후 CompareBasisBadge로 마이그레이션 가능) */
  compareBasis: CompareBasis
  prevValue: number | null
  delta: number | null
  deltaPct: number | null
  trend: Trend
  /** 비교 불가 이유 코드 (표준화된 타입, 기존 string과 호환) */
  reasonCode?: CompareReasonCode | string
  /** 비교 불가 상세 이유 (디버그용, UI에 직접 노출 금지) */
  reasonDetail?: string
}

export interface KeyMetricsCompare {
  revenue?: KeyMetricCompare
  operatingMargin?: KeyMetricCompare
  netMargin?: KeyMetricCompare
  roe?: KeyMetricCompare
  ocf?: KeyMetricCompare
  equity?: KeyMetricCompare
  capex?: KeyMetricCompare
  fcf?: KeyMetricCompare
  cash?: KeyMetricCompare
  netCash?: KeyMetricCompare
  revenueYoY?: KeyMetricCompare
  debtRatio?: KeyMetricCompare
}

declare module '@/types/analysis-bundle' {
  interface BundleFinancialStatement {
    keyMetricsCompare?: KeyMetricsCompare
  }
}
