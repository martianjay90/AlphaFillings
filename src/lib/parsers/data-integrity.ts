/**
 * 데이터 무결성 검증
 * DART/SEC 원천 데이터 확인 시에만 분석 실행
 */

import type { ParserResult } from './interfaces';
import { validateFinancialStatement } from './validation';
import {
  CalculationError,
  InsufficientDataError
} from '@/lib/utils/errors';

/**
 * 데이터 무결성 검증 결과
 */
export interface DataIntegrityResult {
  /** 검증 성공 여부 */
  valid: boolean;
  
  /** 데이터 출처 확인 여부 */
  sourceVerified: boolean;
  
  /** 재무제표 검증 결과 */
  financialStatementValid: boolean;
  
  /** 오류 메시지 */
  errorMessage?: string;
  
  /** 분석 가능 여부 */
  canAnalyze: boolean;
}

/**
 * 파서 결과의 데이터 무결성 검증
 */
export function validateDataIntegrity(
  parserResult: ParserResult
): DataIntegrityResult {
  // 1. 파서 성공 여부 확인
  if (!parserResult.success) {
    return {
      valid: false,
      sourceVerified: false,
      financialStatementValid: false,
      errorMessage: parserResult.error || '데이터 수집에 실패했습니다.',
      canAnalyze: false
    };
  }

  // 2. 재무제표 데이터 존재 확인
  if (!parserResult.financialStatement) {
    return {
      valid: false,
      sourceVerified: false,
      financialStatementValid: false,
      errorMessage: '재무제표 데이터가 없습니다.',
      canAnalyze: false
    };
  }

  // 3. 재무제표 검증
  try {
    const validation = validateFinancialStatement(parserResult.financialStatement);
    
    if (!validation.valid) {
      return {
        valid: false,
        sourceVerified: true, // 출처는 확인되었지만 데이터가 유효하지 않음
        financialStatementValid: false,
        errorMessage: `재무제표 검증 실패: ${validation.errors.join(', ')}`,
        canAnalyze: false
      };
    }

    // 4. 필수 데이터 존재 확인
    const fs = parserResult.financialStatement;
    
    // 손익계산서 필수 항목
    if (!fs.incomeStatement.revenue || !fs.incomeStatement.operatingIncome || !fs.incomeStatement.netIncome) {
      return {
        valid: false,
        sourceVerified: true,
        financialStatementValid: false,
        errorMessage: '손익계산서 필수 항목이 누락되었습니다.',
        canAnalyze: false
      };
    }

    // 재무상태표 필수 항목
    if (!fs.balanceSheet.totalAssets || !fs.balanceSheet.totalLiabilities || !fs.balanceSheet.totalEquity) {
      return {
        valid: false,
        sourceVerified: true,
        financialStatementValid: false,
        errorMessage: '재무상태표 필수 항목이 누락되었습니다.',
        canAnalyze: false
      };
    }

    // 현금흐름표 필수 항목
    if (!fs.cashFlowStatement.operatingCashFlow || !fs.cashFlowStatement.capitalExpenditure) {
      return {
        valid: false,
        sourceVerified: true,
        financialStatementValid: false,
        errorMessage: '현금흐름표 필수 항목이 누락되었습니다.',
        canAnalyze: false
      };
    }

    // 모든 검증 통과
    return {
      valid: true,
      sourceVerified: true,
      financialStatementValid: true,
      canAnalyze: true
    };

  } catch (error) {
    return {
      valid: false,
      sourceVerified: true,
      financialStatementValid: false,
      errorMessage: error instanceof Error ? error.message : '재무제표 검증 중 오류가 발생했습니다.',
      canAnalyze: false
    };
  }
}

/**
 * 분석 가능 여부 확인
 * DART/SEC 원천 데이터가 확인될 때만 true 반환
 */
export function canProceedWithAnalysis(
  parserResult: ParserResult
): boolean {
  const integrity = validateDataIntegrity(parserResult);
  return integrity.canAnalyze;
}

/**
 * 분석 보류 메시지 생성
 */
export function getAnalysisPendingMessage(
  parserResult: ParserResult
): string {
  const integrity = validateDataIntegrity(parserResult);
  
  if (!integrity.sourceVerified) {
    return 'DART/SEC 원천 데이터를 확인할 수 없습니다. 분석이 보류되었습니다.';
  }
  
  if (!integrity.financialStatementValid) {
    return integrity.errorMessage || '재무제표 데이터가 유효하지 않습니다. 분석이 보류되었습니다.';
  }
  
  return '분석을 진행할 수 없습니다.';
}
