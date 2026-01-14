/**
 * 통화 단위 및 회계 기준 처리 유틸리티
 * 한국(KRW/IFRS)과 미국(USD/GAAP) 분리 처리
 */

import type { 
  CountryCode, 
  Currency, 
  AccountingStandard,
  CountryAccountingConfig 
} from '@/types/industry';
import { COUNTRY_ACCOUNTING_CONFIG } from '@/types/industry';

/**
 * 국가 코드로 회계 설정 조회
 */
export function getAccountingConfig(country: CountryCode): CountryAccountingConfig {
  const config = COUNTRY_ACCOUNTING_CONFIG[country];
  if (!config) {
    throw new Error(`Unsupported country code: ${country}`);
  }
  return config;
}

/**
 * 국가 코드로 통화 단위 조회
 */
export function getCurrency(country: CountryCode): Currency {
  return getAccountingConfig(country).currency;
}

/**
 * 국가 코드로 회계 기준 조회
 */
export function getAccountingStandard(country: CountryCode): AccountingStandard {
  return getAccountingConfig(country).standard;
}

/**
 * 숫자를 통화 형식으로 포맷팅
 */
export function formatCurrency(
  amount: number,
  country: CountryCode,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    showSymbol?: boolean;
  }
): string {
  const config = getAccountingConfig(country);
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    showSymbol = true
  } = options || {};

  // 숫자 포맷팅
  const formatted = new Intl.NumberFormat(
    country === 'KR' ? 'ko-KR' : 'en-US',
    {
      minimumFractionDigits,
      maximumFractionDigits,
      style: showSymbol ? 'currency' : 'decimal',
      currency: config.currency
    }
  ).format(amount);

  return formatted;
}

/**
 * 통화 문자열을 숫자로 파싱
 */
export function parseCurrency(
  value: string,
  country: CountryCode
): number {
  const config = getAccountingConfig(country);
  
  // 통화 기호 및 구분자 제거
  let cleaned = value
    .replace(config.currencySymbol, '')
    .replace(new RegExp(`\\${config.thousandSeparator}`, 'g'), '')
    .trim();

  // 소수점 처리
  if (config.decimalSeparator !== '.') {
    cleaned = cleaned.replace(config.decimalSeparator, '.');
  }

  const parsed = parseFloat(cleaned);
  
  if (isNaN(parsed)) {
    throw new Error(`Invalid currency value: ${value}`);
  }

  return parsed;
}

/**
 * 통화 변환 (환율 적용)
 * 실제 구현 시 환율 API 연동 필요
 */
export function convertCurrency(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  exchangeRate: number
): number {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  if (fromCurrency === 'KRW' && toCurrency === 'USD') {
    return amount / exchangeRate;
  } else if (fromCurrency === 'USD' && toCurrency === 'KRW') {
    return amount * exchangeRate;
  }

  throw new Error(`Unsupported currency conversion: ${fromCurrency} to ${toCurrency}`);
}

/**
 * 회계 기준에 따른 항목명 매핑
 * IFRS와 GAAP 간 차이점 처리
 */
export function mapAccountingTerm(
  term: string,
  fromStandard: AccountingStandard,
  toStandard: AccountingStandard
): string {
  if (fromStandard === toStandard) {
    return term;
  }

  // IFRS <-> GAAP 용어 매핑 (예시)
  const termMapping: Record<string, Record<AccountingStandard, string>> = {
    '매출액': {
      IFRS: '매출액',
      GAAP: 'Revenue'
    },
    '영업이익': {
      IFRS: '영업이익',
      GAAP: 'Operating Income'
    },
    '당기순이익': {
      IFRS: '당기순이익',
      GAAP: 'Net Income'
    },
    '자산총계': {
      IFRS: '자산총계',
      GAAP: 'Total Assets'
    },
    '부채총계': {
      IFRS: '부채총계',
      GAAP: 'Total Liabilities'
    },
    '자본총계': {
      IFRS: '자본총계',
      GAAP: 'Total Equity'
    }
  };

  const mapping = termMapping[term];
  if (mapping) {
    return mapping[toStandard];
  }

  // 매핑이 없는 경우 원본 반환
  return term;
}

/**
 * 국가별 기본 할인율 범위
 */
export function getDefaultDiscountRateRange(country: CountryCode): {
  conservative: number;
  base: number;
  optimistic: number;
} {
  // 국가별 무위험 수익률 차이 반영
  if (country === 'KR') {
    return {
      conservative: 0.08,  // 8%
      base: 0.10,          // 10%
      optimistic: 0.12     // 12%
    };
  } else {
    // US
    return {
      conservative: 0.07,  // 7%
      base: 0.09,          // 9%
      optimistic: 0.11     // 11%
    };
  }
}
