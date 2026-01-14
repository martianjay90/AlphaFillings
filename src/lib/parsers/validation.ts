/**
 * 재무제표 데이터 검증 함수
 * 자산 = 부채 + 자본 등식 검증
 */

import type { FinancialStatement } from '@/types/financial';
import {
  CalculationError,
  InsufficientDataError,
  validateRequiredFields
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
 * 재무상태표 검증
 * 자산 = 부채 + 자본 등식이 성립하는지 확인
 */
export interface BalanceSheetValidationResult {
  /** 검증 성공 여부 */
  valid: boolean;
  
  /** 자산총계 */
  totalAssets: number;
  
  /** 부채총계 */
  totalLiabilities: number;
  
  /** 자본총계 */
  totalEquity: number;
  
  /** 계산된 합계 (부채 + 자본) */
  calculatedSum: number;
  
  /** 차이 (자산 - (부채 + 자본)) */
  difference: number;
  
  /** 허용 오차 (기본 0.01%) */
  tolerance: number;
  
  /** 오류 메시지 */
  errorMessage?: string;
  
  /** 출처 항목명 */
  sourceItems: {
    totalAssets: string;
    totalLiabilities: string;
    totalEquity: string;
  };
}

export function validateBalanceSheet(
  balanceSheet: FinancialStatement['balanceSheet'],
  tolerance: number = 0.0001 // 기본 허용 오차 0.01%
): BalanceSheetValidationResult {
  const totalAssets = safeNumber(
    balanceSheet.totalAssets.value,
    '자산총계'
  );
  
  const totalLiabilities = safeNumber(
    balanceSheet.totalLiabilities.value,
    '부채총계'
  );
  
  const totalEquity = safeNumber(
    balanceSheet.totalEquity.value,
    '자본총계'
  );
  
  const calculatedSum = totalLiabilities + totalEquity;
  const difference = Math.abs(totalAssets - calculatedSum);
  
  // 허용 오차 계산 (자산총계의 일정 비율)
  const toleranceAmount = Math.abs(totalAssets) * tolerance;
  
  const valid = difference <= toleranceAmount;
  
  let errorMessage: string | undefined;
  if (!valid) {
    errorMessage = `재무상태표 불일치: 자산총계(${totalAssets.toLocaleString()}) ≠ 부채총계(${totalLiabilities.toLocaleString()}) + 자본총계(${totalEquity.toLocaleString()}). 차이: ${difference.toLocaleString()} (허용 오차: ${toleranceAmount.toLocaleString()})`;
  }
  
  return {
    valid,
    totalAssets,
    totalLiabilities,
    totalEquity,
    calculatedSum,
    difference,
    tolerance: toleranceAmount,
    errorMessage,
    sourceItems: {
      totalAssets: balanceSheet.totalAssets.originalName,
      totalLiabilities: balanceSheet.totalLiabilities.originalName,
      totalEquity: balanceSheet.totalEquity.originalName
    }
  };
}

/**
 * 재무제표 전체 검증
 */
export interface FinancialStatementValidationResult {
  /** 재무상태표 검증 결과 */
  balanceSheet: BalanceSheetValidationResult;
  
  /** 전체 검증 성공 여부 */
  valid: boolean;
  
  /** 모든 오류 메시지 */
  errors: string[];
}

export function validateFinancialStatement(
  financialStatement: FinancialStatement
): FinancialStatementValidationResult {
  const errors: string[] = [];
  
  // 재무상태표 검증
  const balanceSheetValidation = validateBalanceSheet(financialStatement.balanceSheet);
  
  if (!balanceSheetValidation.valid) {
    errors.push(balanceSheetValidation.errorMessage || '재무상태표 검증 실패');
  }
  
  // 손익계산서 기본 검증
  try {
    safeNumber(financialStatement.incomeStatement.revenue.value, '매출액');
    safeNumber(financialStatement.incomeStatement.operatingIncome.value, '영업이익');
    safeNumber(financialStatement.incomeStatement.netIncome.value, '당기순이익');
  } catch (error) {
    if (error instanceof Error) {
      errors.push(`손익계산서 검증 실패: ${error.message}`);
    }
  }
  
  // 현금흐름표 기본 검증
  try {
    safeNumber(financialStatement.cashFlowStatement.operatingCashFlow.value, '영업현금흐름');
    if (financialStatement.cashFlowStatement.capitalExpenditure) {
      safeNumber(financialStatement.cashFlowStatement.capitalExpenditure.value, 'CAPEX');
    }
    if (financialStatement.cashFlowStatement.freeCashFlow) {
      safeNumber(financialStatement.cashFlowStatement.freeCashFlow.value, 'FCF');
    }
  } catch (error) {
    if (error instanceof Error) {
      errors.push(`현금흐름표 검증 실패: ${error.message}`);
    }
  }
  
  return {
    balanceSheet: balanceSheetValidation,
    valid: errors.length === 0,
    errors
  };
}
