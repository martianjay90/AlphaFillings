/**
 * 가치평가 엔진
 * ROIC, S-RIM, DCF 등 핵심 가치평가 로직 구현
 */

import type { IndustryType, IndustryWeights } from '@/types/industry';
import { INDUSTRY_WEIGHTS } from '@/types/industry';
import type {
  FinancialStatement,
  InvestedCapital,
  NOPAT,
  ROICResult,
  SRIMResult
} from '@/types/financial';
import type { MaintenanceCapexRange } from '@/types/analysis';
import {
  CalculationError,
  InsufficientDataError,
  validateNumberRange
} from '@/lib/utils/errors';

/**
 * 안전한 숫자 검증 및 NaN 체크
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
 * 투하자본 (Invested Capital) 계산
 * IC = 영업자산 - 비이자발생부채
 */
export function calculateInvestedCapital(
  balanceSheet: FinancialStatement['balanceSheet']
): InvestedCapital {
  // operatingAssets/nonInterestBearingLiabilities는 optional이므로 체크
  if (!balanceSheet.operatingAssets || !balanceSheet.nonInterestBearingLiabilities) {
    throw new CalculationError(
      '투하자본 계산에 필요한 데이터가 없습니다. 영업자산 또는 비이자발생부채 데이터가 누락되었습니다.',
      'invested_capital_missing',
      {
        hasOperatingAssets: !!balanceSheet.operatingAssets,
        hasNonInterestBearingLiabilities: !!balanceSheet.nonInterestBearingLiabilities
      }
    );
  }

  const operatingAssets = safeNumber(
    balanceSheet.operatingAssets.value,
    '영업자산'
  );
  
  const nonInterestBearingLiabilities = safeNumber(
    balanceSheet.nonInterestBearingLiabilities.value,
    '비이자발생부채'
  );
  
  const investedCapital = operatingAssets - nonInterestBearingLiabilities;
  
  if (investedCapital <= 0) {
    throw new CalculationError(
      '투하자본이 0 이하입니다. 재무제표 데이터를 확인하세요.',
      'invested_capital_validation',
      {
        operatingAssets,
        nonInterestBearingLiabilities,
        investedCapital
      }
    );
  }
  
  return {
    operatingAssets,
    nonInterestBearingLiabilities,
    investedCapital,
    sourceItems: {
      operatingAssets: balanceSheet.operatingAssets.originalName,
      nonInterestBearingLiabilities: balanceSheet.nonInterestBearingLiabilities.originalName
    }
  };
}

/**
 * NOPAT (Net Operating Profit After Tax) 계산
 * NOPAT = 영업이익 × (1 - 세율)
 */
export function calculateNOPAT(
  incomeStatement: FinancialStatement['incomeStatement'],
  taxRate: number = 0.25 // 기본 세율 25%
): NOPAT {
  validateNumberRange(taxRate, 0, 1, '세율');
  
  const operatingIncome = safeNumber(
    incomeStatement.operatingIncome.value,
    '영업이익'
  );
  
  const nopat = operatingIncome * (1 - taxRate);
  
  return {
    operatingIncome,
    taxRate,
    nopat,
    sourceItems: {
      operatingIncome: incomeStatement.operatingIncome.originalName
    }
  };
}

/**
 * ROIC (Return on Invested Capital) 계산
 * ROIC = NOPAT / Invested Capital
 */
export function calculateROIC(
  financialStatement: FinancialStatement,
  taxRate: number = 0.25
): ROICResult {
  const nopat = calculateNOPAT(financialStatement.incomeStatement, taxRate);
  const investedCapital = calculateInvestedCapital(financialStatement.balanceSheet);
  
  const roic = (nopat.nopat / investedCapital.investedCapital) * 100; // 퍼센트로 변환
  
  if (!isFinite(roic)) {
    throw new CalculationError(
      'ROIC 계산 결과가 유효하지 않습니다.',
      'roic_calculation',
      { nopat: nopat.nopat, investedCapital: investedCapital.investedCapital }
    );
  }
  
  return {
    nopat: nopat.nopat,
    investedCapital: investedCapital.investedCapital,
    roic,
    sourceItems: {
      nopat: nopat.sourceItems.operatingIncome,
      investedCapital: `${investedCapital.sourceItems.operatingAssets} - ${investedCapital.sourceItems.nonInterestBearingLiabilities}`
    }
  };
}

/**
 * 유지보수 CAPEX 범위 계산
 * 범위: D&A × 0.7 ~ D&A × 0.9
 */
export function calculateMaintenanceCapexRange(
  incomeStatement: FinancialStatement['incomeStatement']
): MaintenanceCapexRange {
  // 감가상각비가 optional이므로 체크 필요
  if (!incomeStatement.depreciationAndAmortization) {
    throw new CalculationError(
      '감가상각비 데이터가 없습니다. 선택적 필드이므로 계산할 수 없습니다.',
      'depreciation_missing',
      {}
    );
  }
  
  const depreciationAndAmortization = safeNumber(
    incomeStatement.depreciationAndAmortization.value,
    '감가상각비'
  );
  
  if (depreciationAndAmortization < 0) {
    throw new CalculationError(
      '감가상각비가 음수입니다. 재무제표 데이터를 확인하세요.',
      'depreciation_validation',
      { depreciationAndAmortization }
    );
  }
  
  const min = depreciationAndAmortization * 0.7;
  const max = depreciationAndAmortization * 0.9;
  
  // analysis.ts의 MaintenanceCapexRange는 min/max만 포함
  return {
    min,
    max,
  };
}

/**
 * S-RIM 모델: 하방 가격 (Floor Price) 계산
 * 자기자본과 초과이익을 활용
 */
export function calculateSRIM(
  financialStatement: FinancialStatement,
  requiredReturn: number // 요구수익률 (예: 0.1 = 10%)
): SRIMResult {
  validateNumberRange(requiredReturn, 0, 1, '요구수익률');
  
  const equity = safeNumber(
    financialStatement.balanceSheet.totalEquity.value,
    '자기자본'
  );
  
  const roic = calculateROIC(financialStatement);
  const investedCapital = calculateInvestedCapital(financialStatement.balanceSheet);
  
  // 초과이익 = (ROIC - 요구수익률) × 투하자본
  const excessEarnings = ((roic.roic / 100) - requiredReturn) * investedCapital.investedCapital;
  
  // 하방 가격 = 자기자본 + (초과이익 / 요구수익률)
  // 초과이익이 음수일 경우 자기자본만 반환
  const floorPrice = excessEarnings > 0
    ? equity + (excessEarnings / requiredReturn)
    : equity;
  
  if (!isFinite(floorPrice)) {
    throw new CalculationError(
      'S-RIM 계산 결과가 유효하지 않습니다.',
      'srim_calculation',
      { equity, excessEarnings, requiredReturn }
    );
  }
  
  return {
    equity,
    excessEarnings,
    floorPrice,
    sourceItems: {
      equity: financialStatement.balanceSheet.totalEquity.originalName,
      excessEarnings: `(${roic.sourceItems.nopat} / ${investedCapital.investedCapital}) - ${requiredReturn} × ${investedCapital.investedCapital}`
    }
  };
}

/**
 * 산업별 가중치를 적용한 종합 가치평가 점수 계산
 * 복합 기업(SOTP) 가중치 지원
 */
export function calculateWeightedValuation(
  industry: IndustryType | { weights: IndustryWeights; isSOTP: boolean; appliedIndustries?: IndustryType[] },
  metrics: {
    dcf?: number;
    srim?: number;
    pbr?: number;
    per?: number;
    evEbitda?: number;
  }
): {
  compositeScore: number;
  breakdown: Record<string, { value: number; weight: number; contribution: number }>;
  isSOTP?: boolean;
  appliedIndustries?: IndustryType[];
} {
  // SOTP 가중치인 경우
  if (typeof industry === 'object' && industry.isSOTP) {
    const weights = industry.weights;
    const breakdown: Record<string, { value: number; weight: number; contribution: number }> = {};
    let compositeScore = 0;

    if (metrics.dcf !== undefined) {
      const contribution = metrics.dcf * weights.dcfWeight;
      breakdown.dcf = {
        value: metrics.dcf,
        weight: weights.dcfWeight,
        contribution
      };
      compositeScore += contribution;
    }

    if (metrics.srim !== undefined) {
      const contribution = metrics.srim * weights.srimWeight;
      breakdown.srim = {
        value: metrics.srim,
        weight: weights.srimWeight,
        contribution
      };
      compositeScore += contribution;
    }

    if (metrics.pbr !== undefined) {
      const contribution = metrics.pbr * weights.pbrWeight;
      breakdown.pbr = {
        value: metrics.pbr,
        weight: weights.pbrWeight,
        contribution
      };
      compositeScore += contribution;
    }

    if (metrics.per !== undefined) {
      const contribution = metrics.per * weights.perWeight;
      breakdown.per = {
        value: metrics.per,
        weight: weights.perWeight,
        contribution
      };
      compositeScore += contribution;
    }

    if (metrics.evEbitda !== undefined) {
      const contribution = metrics.evEbitda * weights.evEbitdaWeight;
      breakdown.evEbitda = {
        value: metrics.evEbitda,
        weight: weights.evEbitdaWeight,
        contribution
      };
      compositeScore += contribution;
    }

    if (!isFinite(compositeScore)) {
      throw new CalculationError(
        '가중치 적용 계산 결과가 유효하지 않습니다.',
        'weighted_valuation',
        { industry, metrics, weights }
      );
    }

    return {
      compositeScore,
      breakdown,
      isSOTP: true,
      appliedIndustries: industry.appliedIndustries,
    };
  }

  // 일반 산업 가중치
  const weights = typeof industry === 'string' 
    ? INDUSTRY_WEIGHTS[industry] 
    : industry.weights;
  
  const breakdown: Record<string, { value: number; weight: number; contribution: number }> = {};
  let compositeScore = 0;
  
  if (metrics.dcf !== undefined) {
    const contribution = metrics.dcf * weights.dcfWeight;
    breakdown.dcf = {
      value: metrics.dcf,
      weight: weights.dcfWeight,
      contribution
    };
    compositeScore += contribution;
  }
  
  if (metrics.srim !== undefined) {
    const contribution = metrics.srim * weights.srimWeight;
    breakdown.srim = {
      value: metrics.srim,
      weight: weights.srimWeight,
      contribution
    };
    compositeScore += contribution;
  }
  
  if (metrics.pbr !== undefined) {
    const contribution = metrics.pbr * weights.pbrWeight;
    breakdown.pbr = {
      value: metrics.pbr,
      weight: weights.pbrWeight,
      contribution
    };
    compositeScore += contribution;
  }
  
  if (metrics.per !== undefined) {
    const contribution = metrics.per * weights.perWeight;
    breakdown.per = {
      value: metrics.per,
      weight: weights.perWeight,
      contribution
    };
    compositeScore += contribution;
  }
  
  if (metrics.evEbitda !== undefined) {
    const contribution = metrics.evEbitda * weights.evEbitdaWeight;
    breakdown.evEbitda = {
      value: metrics.evEbitda,
      weight: weights.evEbitdaWeight,
      contribution
    };
    compositeScore += contribution;
  }
  
  if (!isFinite(compositeScore)) {
    throw new CalculationError(
      '가중치 적용 계산 결과가 유효하지 않습니다.',
      'weighted_valuation',
      { industry, metrics, weights }
    );
  }
  
  return {
    compositeScore,
    breakdown
  };
}
