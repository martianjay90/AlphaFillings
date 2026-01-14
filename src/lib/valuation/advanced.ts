/**
 * 고도화 분석 로직 엔진
 * WACC, 3단계 할인율 모델, FCF 범위 계산
 */

import type { FinancialStatement } from '@/types/financial';
import { calculateROIC, calculateMaintenanceCapexRange } from './engine';
import {
  CalculationError,
  InsufficientDataError
} from '@/lib/utils/errors';

/**
 * 안전한 숫자 검증
 */
function safeNumber(value: number | undefined | null, fieldName: string): number {
  if (value === undefined || value === null) {
    throw new InsufficientDataError(
      `필수 데이터가 누락되었습니다: ${fieldName}`,
      [fieldName]
    );
  }
  
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    throw new CalculationError(
      `유효하지 않은 숫자 값: ${fieldName} = ${value}`,
      'number_validation',
      { fieldName, value }
    );
  }
  
  return value;
}

/**
 * WACC (Weighted Average Cost of Capital) 계산
 */
export interface WACCResult {
  /** 자기자본 비중 */
  equityWeight: number;
  
  /** 부채 비중 */
  debtWeight: number;
  
  /** 자기자본 비용 (Cost of Equity) */
  costOfEquity: number;
  
  /** 부채 비용 (Cost of Debt) */
  costOfDebt: number;
  
  /** 세율 */
  taxRate: number;
  
  /** WACC (%) */
  wacc: number;
  
  /** 출처 항목명 */
  sourceItems: {
    equity: string;
    debt: string;
  };
}

export function calculateWACC(
  financialStatement: FinancialStatement,
  costOfEquity: number, // 요구수익률 또는 CAPM으로 계산된 값
  costOfDebt: number, // 부채 이자율
  taxRate: number = 0.25
): WACCResult {
  if (costOfEquity < 0 || costOfEquity > 1) {
    throw new CalculationError(
      '자기자본 비용은 0과 1 사이의 값이어야 합니다.',
      'cost_of_equity_validation',
      { costOfEquity }
    );
  }
  
  if (costOfDebt < 0 || costOfDebt > 1) {
    throw new CalculationError(
      '부채 비용은 0과 1 사이의 값이어야 합니다.',
      'cost_of_debt_validation',
      { costOfDebt }
    );
  }
  
  const equity = safeNumber(
    financialStatement.balanceSheet.totalEquity.value,
    '자기자본'
  );
  
  const debt = safeNumber(
    financialStatement.balanceSheet.totalLiabilities.value,
    '부채'
  );
  
  const totalCapital = equity + debt;
  
  if (totalCapital === 0) {
    throw new CalculationError(
      '자본총계가 0입니다. WACC를 계산할 수 없습니다.',
      'wacc_calculation',
      { equity, debt }
    );
  }
  
  const equityWeight = equity / totalCapital;
  const debtWeight = debt / totalCapital;
  
  // WACC = (E/V × Re) + (D/V × Rd × (1 - Tax))
  const wacc = (equityWeight * costOfEquity) + (debtWeight * costOfDebt * (1 - taxRate));
  
  if (!isFinite(wacc)) {
    throw new CalculationError(
      'WACC 계산 결과가 유효하지 않습니다.',
      'wacc_calculation',
      { equityWeight, debtWeight, costOfEquity, costOfDebt, taxRate }
    );
  }
  
  return {
    equityWeight,
    debtWeight,
    costOfEquity,
    costOfDebt,
    taxRate,
    wacc: wacc * 100, // 퍼센트로 변환
    sourceItems: {
      equity: financialStatement.balanceSheet.totalEquity.originalName,
      debt: financialStatement.balanceSheet.totalLiabilities.originalName
    }
  };
}

/**
 * 3단계 할인율 모델
 * 성장 단계별로 다른 할인율 적용
 */
export interface ThreeStageDiscountModel {
  /** 1단계: 고성장기 할인율 */
  stage1Rate: number;
  
  /** 2단계: 안정 성장기 할인율 */
  stage2Rate: number;
  
  /** 3단계: 성숙기 할인율 */
  stage3Rate: number;
  
  /** 1단계 기간 (년) */
  stage1Years: number;
  
  /** 2단계 기간 (년) */
  stage2Years: number;
  
  /** 3단계 기간 (무한대) */
  stage3Years: number;
}

export function createThreeStageDiscountModel(
  conservative: number,
  base: number,
  optimistic: number
): ThreeStageDiscountModel {
  return {
    stage1Rate: optimistic, // 고성장기: 상방 할인율
    stage2Rate: base, // 안정 성장기: 기본 할인율
    stage3Rate: conservative, // 성숙기: 보수적 할인율
    stage1Years: 3,
    stage2Years: 5,
    stage3Years: Infinity,
  };
}

/**
 * FCF 범위 계산 (유지보수 CAPEX 범위 기반)
 */
export interface FCFRangeResult {
  /** FCF 하단 (낙관적 시나리오) */
  fcfMin: number;
  
  /** FCF 상단 (보수적 시나리오) */
  fcfMax: number;
  
  /** 유지보수 CAPEX 범위 */
  maintenanceCapex: {
    min: number;
    max: number;
  };
  
  /** 출처 항목명 */
  sourceItems: {
    operatingCashFlow: string;
    depreciationAndAmortization: string;
  };
}

export function calculateFCFRange(
  financialStatement: FinancialStatement
): FCFRangeResult {
  const ocf = safeNumber(
    financialStatement.cashFlowStatement.operatingCashFlow.value,
    '영업현금흐름'
  );
  
  const maintenanceCapexRange = calculateMaintenanceCapexRange(
    financialStatement.incomeStatement
  );
  
  // FCF = OCF - Maintenance CAPEX
  // 하단: OCF - 최대 CAPEX (보수적)
  // 상단: OCF - 최소 CAPEX (낙관적)
  const fcfMin = ocf - maintenanceCapexRange.max;
  const fcfMax = ocf - maintenanceCapexRange.min;
  
  if (!isFinite(fcfMin) || !isFinite(fcfMax)) {
    throw new CalculationError(
      'FCF 범위 계산 결과가 유효하지 않습니다.',
      'fcf_range_calculation',
      { ocf, maintenanceCapexRange }
    );
  }
  
  return {
    fcfMin,
    fcfMax,
    maintenanceCapex: {
      min: maintenanceCapexRange.min,
      max: maintenanceCapexRange.max,
    },
      sourceItems: {
        operatingCashFlow: financialStatement.cashFlowStatement.operatingCashFlow.originalName,
        depreciationAndAmortization: financialStatement.incomeStatement.depreciationAndAmortization?.originalName || 'Depreciation & Amortization'
      }
  };
}
