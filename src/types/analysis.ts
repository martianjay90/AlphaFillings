/**
 * 분석 입력 및 결과 타입 정의
 */

import type { CountryCode, IndustryType } from './industry';
import type { AnalysisStatus } from '@/lib/utils/errors';

/**
 * 할인율 3점 추정
 */
export interface DiscountRateEstimate {
  /** 보수적 추정 */
  conservative: number;
  /** 기본 추정 */
  base: number;
  /** 상방 추정 */
  optimistic: number;
}

/**
 * 유지보수 CAPEX 범위
 */
export interface MaintenanceCapexRange {
  /** 최소값 */
  min: number;
  /** 최대값 */
  max: number;
}

/**
 * 분석 입력 파라미터
 */
export interface AnalysisInput {
  /** 기업명 또는 티커 */
  companyNameOrTicker: string;
  
  /** 국가 선택 */
  country: CountryCode;
  
  /** 산업군 */
  industry: IndustryType;
  
  /** 할인율 3점 추정 */
  discountRate: DiscountRateEstimate;
  
  /** 성장률 (%) */
  growthRate: number;
  
  /** 유지보수 CAPEX 범위 */
  maintenanceCapex: MaintenanceCapexRange;
}

/**
 * 분석 결과
 */
export interface AnalysisResult {
  /** 분석 상태 */
  status: AnalysisStatus;
  
  /** 기업명 */
  companyName?: string;
  
  /** 티커 */
  ticker?: string;
  
  /** 계산된 기업 가치 */
  valuation?: {
    /** DCF 가치 */
    dcf?: number;
    /** S-RIM 가치 */
    srim?: number;
    /** 종합 가치 (가중 평균) */
    composite?: number;
  };
  
  /** 에러 정보 */
  error?: {
    message: string;
    details?: Record<string, unknown>;
  };
  
  /** 분석 일시 */
  timestamp: string;
}
