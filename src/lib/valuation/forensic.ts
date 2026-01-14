/**
 * 포렌식 회계 필터
 * 공매도(Short) 관점에서 재무제표의 질을 검증
 */

import type { FinancialStatement } from '@/types/financial';
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
 * 이익의 질 체크
 * EPS 성장률과 OCF(영업현금흐름) 성장률의 괴리 분석
 * 괴리율 20% 이상 시 경고
 */
export interface EarningsQualityCheck {
  /** EPS 성장률 (%) */
  epsGrowthRate: number;
  
  /** OCF 성장률 (%) */
  ocfGrowthRate: number;
  
  /** 괴리율 (%) */
  divergenceRate: number;
  
  /** 경고 여부 (괴리율 20% 이상) */
  warning: boolean;
  
  /** 경고 메시지 */
  warningMessage?: string;
  
  /** 출처 항목명 */
  sourceItems: {
    eps: string;
    ocf: string;
  };
}

export function checkEarningsQuality(
  current: FinancialStatement,
  previous?: FinancialStatement
): EarningsQualityCheck {
  if (!previous) {
    throw new InsufficientDataError(
      '전년 대비 데이터가 필요합니다.',
      ['previousYear']
    );
  }
  
  // EPS 성장률 계산
  const currentEPS = safeNumber(
    current.incomeStatement.eps?.value,
    '당기 EPS'
  );
  const previousEPS = safeNumber(
    previous.incomeStatement.eps?.value,
    '전기 EPS'
  );
  
  if (previousEPS === 0) {
    throw new CalculationError(
      '전기 EPS가 0입니다. 성장률을 계산할 수 없습니다.',
      'eps_growth_calculation',
      { currentEPS, previousEPS }
    );
  }
  
  const epsGrowthRate = ((currentEPS - previousEPS) / Math.abs(previousEPS)) * 100;
  
  // OCF 성장률 계산
  const currentOCF = safeNumber(
    current.cashFlowStatement.operatingCashFlow.value,
    '당기 영업현금흐름'
  );
  const previousOCF = safeNumber(
    previous.cashFlowStatement.operatingCashFlow.value,
    '전기 영업현금흐름'
  );
  
  if (previousOCF === 0) {
    throw new CalculationError(
      '전기 영업현금흐름이 0입니다. 성장률을 계산할 수 없습니다.',
      'ocf_growth_calculation',
      { currentOCF, previousOCF }
    );
  }
  
  const ocfGrowthRate = ((currentOCF - previousOCF) / Math.abs(previousOCF)) * 100;
  
  // 괴리율 계산 (절대값)
  const divergenceRate = Math.abs(epsGrowthRate - ocfGrowthRate);
  
  // 경고 여부 (괴리율 20% 이상)
  const warning = divergenceRate >= 20;
  
  let warningMessage: string | undefined;
  if (warning) {
    if (epsGrowthRate > ocfGrowthRate) {
      warningMessage = `EPS 성장률(${epsGrowthRate.toFixed(2)}%)이 OCF 성장률(${ocfGrowthRate.toFixed(2)}%)보다 ${divergenceRate.toFixed(2)}%p 높습니다. 이익의 질에 의심이 있습니다.`;
    } else {
      warningMessage = `OCF 성장률(${ocfGrowthRate.toFixed(2)}%)이 EPS 성장률(${epsGrowthRate.toFixed(2)}%)보다 ${divergenceRate.toFixed(2)}%p 높습니다. 현금흐름이 이익보다 빠르게 성장하고 있습니다.`;
    }
  }
  
  return {
    epsGrowthRate,
    ocfGrowthRate,
    divergenceRate,
    warning,
    warningMessage,
    sourceItems: {
      eps: current.incomeStatement.eps?.originalName || 'EPS',
      ocf: current.cashFlowStatement.operatingCashFlow.originalName
    }
  };
}

/**
 * 운전자본 트랩 검증
 * 매출 증가율보다 매출채권/재고 증가율이 높을 경우 '매출 조작 의심' 플래그
 */
export interface WorkingCapitalTrapCheck {
  /** 매출 증가율 (%) */
  revenueGrowthRate: number;
  
  /** 매출채권 증가율 (%) */
  accountsReceivableGrowthRate: number;
  
  /** 재고 증가율 (%) */
  inventoryGrowthRate: number;
  
  /** 매출 조작 의심 여부 */
  suspicious: boolean;
  
  /** 의심 사유 */
  suspicionReason?: string;
  
  /** 출처 항목명 */
  sourceItems: {
    revenue: string;
    accountsReceivable?: string;
    inventory?: string;
  };
}

export function checkWorkingCapitalTrap(
  current: FinancialStatement,
  previous?: FinancialStatement
): WorkingCapitalTrapCheck {
  if (!previous) {
    throw new InsufficientDataError(
      '전년 대비 데이터가 필요합니다.',
      ['previousYear']
    );
  }
  
  // 매출 증가율 계산
  const currentRevenue = safeNumber(
    current.incomeStatement.revenue.value,
    '당기 매출액'
  );
  const previousRevenue = safeNumber(
    previous.incomeStatement.revenue.value,
    '전기 매출액'
  );
  
  if (previousRevenue === 0) {
    throw new CalculationError(
      '전기 매출액이 0입니다. 성장률을 계산할 수 없습니다.',
      'revenue_growth_calculation',
      { currentRevenue, previousRevenue }
    );
  }
  
  const revenueGrowthRate = ((currentRevenue - previousRevenue) / Math.abs(previousRevenue)) * 100;
  
  let accountsReceivableGrowthRate: number | undefined;
  let inventoryGrowthRate: number | undefined;
  let suspicious = false;
  let suspicionReason: string | undefined;
  
  // 매출채권 증가율 계산
  if (current.balanceSheet.accountsReceivable && previous.balanceSheet.accountsReceivable) {
    const currentAR = safeNumber(
      current.balanceSheet.accountsReceivable.value,
      '당기 매출채권'
    );
    const previousAR = safeNumber(
      previous.balanceSheet.accountsReceivable.value,
      '전기 매출채권'
    );
    
    if (previousAR !== 0) {
      accountsReceivableGrowthRate = ((currentAR - previousAR) / Math.abs(previousAR)) * 100;
      
      if (accountsReceivableGrowthRate > revenueGrowthRate) {
        suspicious = true;
        suspicionReason = `매출채권 증가율(${accountsReceivableGrowthRate.toFixed(2)}%)이 매출 증가율(${revenueGrowthRate.toFixed(2)}%)보다 높습니다. 매출 조작 의심.`;
      }
    }
  }
  
  // 재고 증가율 계산
  if (current.balanceSheet.inventory && previous.balanceSheet.inventory) {
    const currentInventory = safeNumber(
      current.balanceSheet.inventory.value,
      '당기 재고자산'
    );
    const previousInventory = safeNumber(
      previous.balanceSheet.inventory.value,
      '전기 재고자산'
    );
    
    if (previousInventory !== 0) {
      inventoryGrowthRate = ((currentInventory - previousInventory) / Math.abs(previousInventory)) * 100;
      
      if (inventoryGrowthRate > revenueGrowthRate) {
        suspicious = true;
        const reason = `재고 증가율(${inventoryGrowthRate.toFixed(2)}%)이 매출 증가율(${revenueGrowthRate.toFixed(2)}%)보다 높습니다. 매출 조작 의심.`;
        suspicionReason = suspicionReason
          ? `${suspicionReason} ${reason}`
          : reason;
      }
    }
  }
  
  return {
    revenueGrowthRate,
    accountsReceivableGrowthRate: accountsReceivableGrowthRate ?? 0,
    inventoryGrowthRate: inventoryGrowthRate ?? 0,
    suspicious,
    suspicionReason,
    sourceItems: {
      revenue: current.incomeStatement.revenue.originalName,
      accountsReceivable: current.balanceSheet.accountsReceivable?.originalName,
      inventory: current.balanceSheet.inventory?.originalName
    }
  };
}

/**
 * 자본배분 점수
 * CAPEX 대비 FCF 창출 능력을 점수화 (0-100점)
 */
export interface CapitalAllocationScore {
  /** CAPEX */
  capex: number;
  
  /** FCF (잉여현금흐름) */
  fcf: number;
  
  /** FCF/CAPEX 비율 */
  fcfToCapexRatio: number;
  
  /** 점수 (0-100) */
  score: number;
  
  /** 평가 */
  evaluation: 'excellent' | 'good' | 'fair' | 'poor';
  
  /** 출처 항목명 */
  sourceItems: {
    capex: string;
    fcf: string;
  };
}

export function calculateCapitalAllocationScore(
  financialStatement: FinancialStatement
): CapitalAllocationScore {
  const capex = financialStatement.cashFlowStatement.capitalExpenditure
    ? safeNumber(
        financialStatement.cashFlowStatement.capitalExpenditure.value,
        'CAPEX'
      )
    : 0;
  
  const fcf = financialStatement.cashFlowStatement.freeCashFlow
    ? safeNumber(
        financialStatement.cashFlowStatement.freeCashFlow.value,
        'FCF'
      )
    : 0;
  
  if (capex === 0) {
    throw new CalculationError(
      'CAPEX가 0입니다. 자본배분 점수를 계산할 수 없습니다.',
      'capital_allocation_calculation',
      { capex, fcf }
    );
  }
  
  const fcfToCapexRatio = fcf / capex;
  
  // 점수 계산 (FCF/CAPEX 비율 기반)
  // 비율이 높을수록 좋음 (최대 100점)
  let score: number;
  if (fcfToCapexRatio >= 1.0) {
    score = 100; // FCF가 CAPEX보다 크거나 같으면 만점
  } else if (fcfToCapexRatio >= 0.5) {
    score = 50 + (fcfToCapexRatio - 0.5) * 100; // 0.5~1.0: 50~100점
  } else if (fcfToCapexRatio >= 0) {
    score = fcfToCapexRatio * 100; // 0~0.5: 0~50점
  } else {
    score = 0; // FCF가 음수면 0점
  }
  
  // 점수 범위 제한
  score = Math.max(0, Math.min(100, score));
  
  // 평가 등급
  let evaluation: 'excellent' | 'good' | 'fair' | 'poor';
  if (score >= 80) {
    evaluation = 'excellent';
  } else if (score >= 60) {
    evaluation = 'good';
  } else if (score >= 40) {
    evaluation = 'fair';
  } else {
    evaluation = 'poor';
  }
  
  if (!isFinite(score)) {
    throw new CalculationError(
      '자본배분 점수 계산 결과가 유효하지 않습니다.',
      'capital_allocation_score',
      { capex, fcf, fcfToCapexRatio }
    );
  }
  
  return {
    capex,
    fcf,
    fcfToCapexRatio,
    score,
    evaluation,
      sourceItems: {
        capex: financialStatement.cashFlowStatement.capitalExpenditure?.originalName || 'CAPEX',
        fcf: financialStatement.cashFlowStatement.freeCashFlow?.originalName || 'FCF'
      }
  };
}
