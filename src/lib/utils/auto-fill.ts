/**
 * Auto-Fill 유틸리티
 * 초보자를 위한 산업별 표준값 자동 입력
 */

import type { IndustryType, CountryCode } from '@/types/industry';
import { getDefaultDiscountRateRange } from './currency';

/**
 * 산업별 표준 할인율 (기본값)
 */
const INDUSTRY_DEFAULT_DISCOUNT_RATE: Record<IndustryType, {
  conservative: number;
  base: number;
  optimistic: number;
}> = {
  manufacturing: { conservative: 8, base: 10, optimistic: 12 },
  it: { conservative: 9, base: 11, optimistic: 13 },
  finance: { conservative: 7, base: 9, optimistic: 11 },
  bio: { conservative: 10, base: 12, optimistic: 14 },
  retail: { conservative: 8, base: 10, optimistic: 12 },
  energy: { conservative: 8, base: 10, optimistic: 12 },
  construction: { conservative: 9, base: 11, optimistic: 13 },
  service: { conservative: 8, base: 10, optimistic: 12 },
  other: { conservative: 8, base: 10, optimistic: 12 },
};

/**
 * 산업별 표준 성장률 (%)
 */
const INDUSTRY_DEFAULT_GROWTH_RATE: Record<IndustryType, number> = {
  manufacturing: 5,
  it: 8,
  finance: 6,
  bio: 10,
  retail: 4,
  energy: 3,
  construction: 4,
  service: 5,
  other: 5,
};

/**
 * Auto-Fill 값 조회
 */
export interface AutoFillValues {
  discountRate: {
    conservative: number;
    base: number;
    optimistic: number;
  };
  growthRate: number;
  maintenanceCapex: {
    min: number; // D&A × 0.7
    max: number; // D&A × 0.9
  };
}

/**
 * 산업별 표준값 자동 입력
 */
export function getAutoFillValues(
  industry: IndustryType,
  country: CountryCode
): AutoFillValues {
  // 국가별 기본 할인율 조정
  const countryBase = getDefaultDiscountRateRange(country);
  const industryBase = INDUSTRY_DEFAULT_DISCOUNT_RATE[industry];
  
  // 국가 기본값과 산업 기본값의 평균 사용
  const discountRate = {
    conservative: (countryBase.conservative + industryBase.conservative) / 2,
    base: (countryBase.base + industryBase.base) / 2,
    optimistic: (countryBase.optimistic + industryBase.optimistic) / 2,
  };

  return {
    discountRate,
    growthRate: INDUSTRY_DEFAULT_GROWTH_RATE[industry],
    maintenanceCapex: {
      min: 0.7, // D&A × 0.7 (비율)
      max: 0.9, // D&A × 0.9 (비율)
    },
  };
}
