/**
 * 산업별 가중치 및 분석 기준 정의
 * 엄격한 타입 정의로 데이터 일관성 보장
 */

/**
 * 지원 산업군
 */
export type IndustryType = 
  | 'manufacturing'  // 제조업
  | 'it'            // IT/소프트웨어
  | 'finance'       // 금융
  | 'bio'           // 바이오/제약
  | 'retail'        // 유통/소매
  | 'energy'        // 에너지
  | 'construction'  // 건설
  | 'service'       // 서비스업
  | 'other';        // 기타

/**
 * 국가 코드
 */
export type CountryCode = 'KR' | 'US';

/**
 * 회계 기준
 */
export type AccountingStandard = 'IFRS' | 'GAAP';

/**
 * 통화 단위
 */
export type Currency = 'KRW' | 'USD';

/**
 * 산업별 가중치 인터페이스
 * 각 산업군에 맞는 평가 가중치를 정의
 */
export interface IndustryWeights {
  /** 산업군 식별자 */
  industry: IndustryType;
  
  /** DCF 가중치 (0-1) */
  dcfWeight: number;
  
  /** S-RIM 가중치 (0-1) */
  srimWeight: number;
  
  /** PBR 가중치 (0-1) */
  pbrWeight: number;
  
  /** PER 가중치 (0-1) */
  perWeight: number;
  
  /** EV/EBITDA 가중치 (0-1) */
  evEbitdaWeight: number;
  
  /** 가중치 합계는 1.0이어야 함 */
  readonly totalWeight: number;
}

/**
 * 국가별 회계 기준 매핑
 */
export interface CountryAccountingConfig {
  /** 국가 코드 */
  country: CountryCode;
  
  /** 회계 기준 */
  standard: AccountingStandard;
  
  /** 통화 단위 */
  currency: Currency;
  
  /** 통화 기호 */
  currencySymbol: string;
  
  /** 천 단위 구분자 */
  thousandSeparator: string;
  
  /** 소수점 구분자 */
  decimalSeparator: string;
}

/**
 * 산업별 가중치 사전 정의
 * 실제 사용 시 데이터베이스나 설정 파일에서 로드 가능
 */
export const INDUSTRY_WEIGHTS: Record<IndustryType, IndustryWeights> = {
  manufacturing: {
    industry: 'manufacturing',
    dcfWeight: 0.4,
    srimWeight: 0.3,
    pbrWeight: 0.15,
    perWeight: 0.1,
    evEbitdaWeight: 0.05,
    get totalWeight() {
      return this.dcfWeight + this.srimWeight + this.pbrWeight + 
             this.perWeight + this.evEbitdaWeight;
    }
  },
  it: {
    industry: 'it',
    dcfWeight: 0.5,
    srimWeight: 0.2,
    pbrWeight: 0.1,
    perWeight: 0.15,
    evEbitdaWeight: 0.05,
    get totalWeight() {
      return this.dcfWeight + this.srimWeight + this.pbrWeight + 
             this.perWeight + this.evEbitdaWeight;
    }
  },
  finance: {
    industry: 'finance',
    dcfWeight: 0.3,
    srimWeight: 0.4,
    pbrWeight: 0.2,
    perWeight: 0.05,
    evEbitdaWeight: 0.05,
    get totalWeight() {
      return this.dcfWeight + this.srimWeight + this.pbrWeight + 
             this.perWeight + this.evEbitdaWeight;
    }
  },
  bio: {
    industry: 'bio',
    dcfWeight: 0.6,
    srimWeight: 0.15,
    pbrWeight: 0.1,
    perWeight: 0.1,
    evEbitdaWeight: 0.05,
    get totalWeight() {
      return this.dcfWeight + this.srimWeight + this.pbrWeight + 
             this.perWeight + this.evEbitdaWeight;
    }
  },
  retail: {
    industry: 'retail',
    dcfWeight: 0.35,
    srimWeight: 0.3,
    pbrWeight: 0.2,
    perWeight: 0.1,
    evEbitdaWeight: 0.05,
    get totalWeight() {
      return this.dcfWeight + this.srimWeight + this.pbrWeight + 
             this.perWeight + this.evEbitdaWeight;
    }
  },
  energy: {
    industry: 'energy',
    dcfWeight: 0.4,
    srimWeight: 0.3,
    pbrWeight: 0.15,
    perWeight: 0.1,
    evEbitdaWeight: 0.05,
    get totalWeight() {
      return this.dcfWeight + this.srimWeight + this.pbrWeight + 
             this.perWeight + this.evEbitdaWeight;
    }
  },
  construction: {
    industry: 'construction',
    dcfWeight: 0.35,
    srimWeight: 0.3,
    pbrWeight: 0.2,
    perWeight: 0.1,
    evEbitdaWeight: 0.05,
    get totalWeight() {
      return this.dcfWeight + this.srimWeight + this.pbrWeight + 
             this.perWeight + this.evEbitdaWeight;
    }
  },
  service: {
    industry: 'service',
    dcfWeight: 0.4,
    srimWeight: 0.3,
    pbrWeight: 0.15,
    perWeight: 0.1,
    evEbitdaWeight: 0.05,
    get totalWeight() {
      return this.dcfWeight + this.srimWeight + this.pbrWeight + 
             this.perWeight + this.evEbitdaWeight;
    }
  },
  other: {
    industry: 'other',
    dcfWeight: 0.4,
    srimWeight: 0.3,
    pbrWeight: 0.15,
    perWeight: 0.1,
    evEbitdaWeight: 0.05,
    get totalWeight() {
      return this.dcfWeight + this.srimWeight + this.pbrWeight + 
             this.perWeight + this.evEbitdaWeight;
    }
  }
};

/**
 * 국가별 회계 기준 설정
 */
export const COUNTRY_ACCOUNTING_CONFIG: Record<CountryCode, CountryAccountingConfig> = {
  KR: {
    country: 'KR',
    standard: 'IFRS',
    currency: 'KRW',
    currencySymbol: '₩',
    thousandSeparator: ',',
    decimalSeparator: '.'
  },
  US: {
    country: 'US',
    standard: 'GAAP',
    currency: 'USD',
    currencySymbol: '$',
    thousandSeparator: ',',
    decimalSeparator: '.'
  }
};

/**
 * 산업군 한글명 매핑
 */
export const INDUSTRY_NAMES: Record<IndustryType, string> = {
  manufacturing: '제조업',
  it: 'IT/소프트웨어',
  finance: '금융',
  bio: '바이오/제약',
  retail: '유통/소매',
  energy: '에너지',
  construction: '건설',
  service: '서비스업',
  other: '기타'
};

/**
 * 가중치 유효성 검증
 */
export function validateWeights(weights: IndustryWeights): boolean {
  const tolerance = 0.01; // 1% 허용 오차
  return Math.abs(weights.totalWeight - 1.0) < tolerance;
}

/**
 * 범용 가이드라인 가중치 (산업군이 일치하지 않을 때 사용)
 */
export const UNIVERSAL_WEIGHTS: IndustryWeights = {
  industry: 'other',
  dcfWeight: 0.4,
  srimWeight: 0.3,
  pbrWeight: 0.15,
  perWeight: 0.1,
  evEbitdaWeight: 0.05,
  get totalWeight() {
    return this.dcfWeight + this.srimWeight + this.pbrWeight +
           this.perWeight + this.evEbitdaWeight;
  }
};

/**
 * 산업군 가중치 가져오기 (예외 처리 포함)
 */
export function getIndustryWeights(industry: IndustryType | string): IndustryWeights {
  // 산업군이 유효한지 확인
  if (industry in INDUSTRY_WEIGHTS) {
    return INDUSTRY_WEIGHTS[industry as IndustryType];
  }
  
  // 범용 가이드라인 반환
  return UNIVERSAL_WEIGHTS;
}
