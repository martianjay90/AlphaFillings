/**
 * 재무제표 데이터 타입 정의
 * 엄격한 타입으로 데이터 무결성 보장
 */

import type { CountryCode, AccountingStandard } from './industry';

/**
 * 재무제표 항목명 및 출처 정보
 */
export interface FinancialItem {
  /** 항목명 (한글/영문) */
  name: string;
  
  /** 원본 재무제표 항목명 */
  originalName: string;
  
  /** 재무제표 출처 (DART/SEC) */
  source: 'DART' | 'SEC';
  
  /** 회계 기준 */
  standard: AccountingStandard;
  
  /** 값 */
  value: number;
  
  /** 단위 (원/달러) */
  unit: string;
}

/**
 * 손익계산서 항목
 */
export interface IncomeStatement {
  /** 매출액 */
  revenue: FinancialItem;
  
  /** 작년 같은 기간 매출 (YoY 성장률 계산용) */
  revenuePrevYear?: FinancialItem;
  
  /** 작년 같은 기간 영업이익 (YoY 비교용) */
  operatingIncomePrevYear?: FinancialItem;
  
  /** 작년 같은 기간 순이익 (YoY 비교용, EPS 스코프와 동일 기준) */
  netIncomePrevYear?: FinancialItem;
  
  /** 영업이익 */
  operatingIncome: FinancialItem;
  
  /** 당기순이익 (EPS와 동일 스코프: 계속영업 우선, 없으면 총계) */
  netIncome: FinancialItem;
  
  /** 중단영업 순이익 (선택적) */
  netIncomeDiscontinued?: FinancialItem;
  
  /** EPS (주당순이익, 계속영업 우선, 없으면 총계) */
  eps?: FinancialItem;
  
  /** 감가상각비 (D&A) - optional (선택적 필드) */
  depreciationAndAmortization?: FinancialItem;
  
  /** 영업현금흐름 (OCF) */
  operatingCashFlow: FinancialItem;
}

/**
 * 재무상태표 항목
 */
export interface BalanceSheet {
  /** 자산총계 */
  totalAssets: FinancialItem;
  
  /** 부채총계 */
  totalLiabilities: FinancialItem;
  
  /** 자본총계 */
  totalEquity: FinancialItem;
  
  /** 영업자산 (Operating Assets) - optional */
  operatingAssets?: FinancialItem;
  
  /** 비이자발생부채 (Non-interest bearing liabilities) - optional */
  nonInterestBearingLiabilities?: FinancialItem;
  
  /** 매출채권 (Accounts Receivable) */
  accountsReceivable?: FinancialItem;
  
  /** 재고자산 (Inventory) */
  inventory?: FinancialItem;
  
  /** 현금 및 현금성자산 (Cash and cash equivalents) - optional, ROIC 계산용 */
  cash?: FinancialItem;
  
  /** 이자발생부채 (Interest-bearing debt: 단기+장기차입금+사채 등) - optional, ROIC 계산용 */
  interestBearingDebt?: FinancialItem;
  
  /** 전기말 자본총계 (vs 전기말 비교용) */
  equityPriorEnd?: FinancialItem;
  
  /** 전기말 현금 및 현금성자산 (vs 전기말 비교용) */
  cashPriorEnd?: FinancialItem;
  
  /** 전기말 이자발생부채 (vs 전기말 비교용) */
  debtPriorEnd?: FinancialItem;
  
  /** 전기말 순현금/순차입금 (vs 전기말 비교용, cashPriorEnd - debtPriorEnd) */
  netCashPriorEnd?: FinancialItem;
  
  /** 전기말 부채총계 (vs 전기말 비교용, 부채비율 계산) */
  totalLiabilitiesPriorEnd?: FinancialItem;
}

/**
 * 현금흐름표 항목
 */
export interface CashFlowStatement {
  /** 영업현금흐름 (OCF) */
  operatingCashFlow: FinancialItem;
  
  /** 투자현금흐름 (CAPEX 포함) */
  investingCashFlow?: FinancialItem;
  
  /** 재무현금흐름 */
  financingCashFlow?: FinancialItem;
  
  /** CAPEX (자본적 지출) - 선택적: 찾지 못하면 null/undefined (정책 결과) */
  capitalExpenditure?: FinancialItem;
  
  /** CAPEX PPE (유형자산 자본적지출) - 선택적: 구조적 분리 */
  capexPPE?: FinancialItem;
  
  /** CAPEX Intangible (무형자산 자본적지출) - 선택적: 구조적 분리 */
  capexIntangible?: FinancialItem;
  
  /** 잉여현금흐름 (FCF) - 선택적: CAPEX가 없으면 계산 불가 */
  freeCashFlow?: FinancialItem;
  
  /** 작년 같은 기간 영업현금흐름 (YoY 비교용) */
  ocfPrevYear?: FinancialItem;
  
  /** 작년 같은 기간 CAPEX (YoY 비교용) */
  capitalExpenditurePrevYear?: FinancialItem;
}

/**
 * 재무제표 데이터 (연도별)
 */
export interface FinancialStatement {
  /** 회사명 */
  companyName: string;
  
  /** 티커 */
  ticker: string;
  
  /** 국가 */
  country: CountryCode;
  
  /** 회계연도 */
  fiscalYear: number;
  
  /** 분기 (0 = 연간) */
  quarter: number;
  
  /** 기간 타입 및 라벨 ("Q3(3M)", "9M(YTD)", "FY" 등) */
  periodType?: 'FY' | 'Q' | 'YTD';
  periodTypeLabel?: string; // UI 표시용: "Q3(3M)", "9M(YTD)" 등
  
  /** 기간 시작일 (YTD/Q의 경우 필수, XBRL Parser에서 확정한 anchor 기간) */
  startDate?: string; // ISO 8601 형식: "YYYY-MM-DD"
  
  /** 기간 종료일 (모든 경우 필수, XBRL Parser에서 확정한 anchor 기간) */
  endDate?: string; // ISO 8601 형식: "YYYY-MM-DD"
  
  /** 손익계산서 */
  incomeStatement: IncomeStatement;
  
  /** 재무상태표 */
  balanceSheet: BalanceSheet;
  
  /** 현금흐름표 */
  cashFlowStatement: CashFlowStatement;
  
  /** 전년 대비 데이터 (성장률 계산용) */
  previousYear?: FinancialStatement;
}

/**
 * 투하자본 (Invested Capital) 계산 결과
 */
export interface InvestedCapital {
  /** 영업자산 */
  operatingAssets: number;
  
  /** 비이자발생부채 */
  nonInterestBearingLiabilities: number;
  
  /** 투하자본 (IC = 영업자산 - 비이자발생부채) */
  investedCapital: number;
  
  /** 출처 항목명 */
  sourceItems: {
    operatingAssets: string;
    nonInterestBearingLiabilities: string;
  };
}

/**
 * NOPAT (Net Operating Profit After Tax) 계산 결과
 */
export interface NOPAT {
  /** 영업이익 */
  operatingIncome: number;
  
  /** 세율 (예: 0.25 = 25%) */
  taxRate: number;
  
  /** NOPAT */
  nopat: number;
  
  /** 출처 항목명 */
  sourceItems: {
    operatingIncome: string;
  };
}

/**
 * ROIC 계산 결과
 */
export interface ROICResult {
  /** NOPAT */
  nopat: number;
  
  /** 투하자본 */
  investedCapital: number;
  
  /** ROIC (%) */
  roic: number;
  
  /** 출처 항목명 */
  sourceItems: {
    nopat: string;
    investedCapital: string;
  };
}

// MaintenanceCapexRange는 analysis.ts에서 정의됨 (중복 제거)
// financial.ts에서는 사용하지 않음

/**
 * S-RIM 모델 계산 결과
 */
export interface SRIMResult {
  /** 자기자본 */
  equity: number;
  
  /** 초과이익 */
  excessEarnings: number;
  
  /** 하방 가격 (Floor Price) */
  floorPrice: number;
  
  /** 출처 항목명 */
  sourceItems: {
    equity: string;
    excessEarnings: string;
  };
}
