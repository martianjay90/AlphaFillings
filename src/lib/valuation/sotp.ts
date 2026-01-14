/**
 * SOTP (Sum of the Parts) 가중치 계산
 * 복합 기업의 다중 산업 가중치 합산
 */

import type { IndustryType, IndustryWeights } from '@/types/industry';
import { INDUSTRY_WEIGHTS } from '@/types/industry';

/**
 * 산업별 매출 구성 비중
 */
export interface IndustryRevenueShare {
  /** 산업군 */
  industry: IndustryType;
  
  /** 매출 비중 (0-1) */
  revenueShare: number;
  
  /** 매출액 (선택) */
  revenue?: number;
}

/**
 * SOTP 가중치 계산 결과
 */
export interface SOTPWeights extends IndustryWeights {
  /** 산업 구성 */
  industryComposition: IndustryRevenueShare[];
  
  /** 복합 기업 여부 */
  isConglomerate: boolean;
  
  /** 적용된 산업군 목록 */
  appliedIndustries: IndustryType[];
}

/**
 * 복합 기업 가중치 계산 (SOTP)
 * @param industryComposition 산업별 매출 구성 비중
 * @returns 합산된 가중치
 */
export function calculateSOTPWeights(
  industryComposition: IndustryRevenueShare[]
): SOTPWeights {
  // 매출 비중 합계 검증
  const totalShare = industryComposition.reduce(
    (sum, comp) => sum + comp.revenueShare,
    0
  );
  
  if (Math.abs(totalShare - 1.0) > 0.01) {
    throw new Error(
      `매출 비중 합계가 1.0이 아닙니다. (현재: ${totalShare.toFixed(2)})`
    );
  }

  // 단일 산업인 경우
  if (industryComposition.length === 1) {
    const singleIndustry = industryComposition[0];
    const weights = INDUSTRY_WEIGHTS[singleIndustry.industry];
    
    return {
      ...weights,
      industryComposition,
      isConglomerate: false,
      appliedIndustries: [singleIndustry.industry],
    };
  }

  // 복합 기업인 경우 가중 평균 계산
  const sotpWeights: Partial<IndustryWeights> = {
    dcfWeight: 0,
    srimWeight: 0,
    pbrWeight: 0,
    perWeight: 0,
    evEbitdaWeight: 0,
  };

  const appliedIndustries: IndustryType[] = [];

  for (const comp of industryComposition) {
    const industryWeights = INDUSTRY_WEIGHTS[comp.industry];
    const weight = comp.revenueShare;

    sotpWeights.dcfWeight! += industryWeights.dcfWeight * weight;
    sotpWeights.srimWeight! += industryWeights.srimWeight * weight;
    sotpWeights.pbrWeight! += industryWeights.pbrWeight * weight;
    sotpWeights.perWeight! += industryWeights.perWeight * weight;
    sotpWeights.evEbitdaWeight! += industryWeights.evEbitdaWeight * weight;

    appliedIndustries.push(comp.industry);
  }

  // 가중치 정규화 (합계가 1.0이 되도록)
  const totalWeight = 
    sotpWeights.dcfWeight! +
    sotpWeights.srimWeight! +
    sotpWeights.pbrWeight! +
    sotpWeights.perWeight! +
    sotpWeights.evEbitdaWeight!;

  if (Math.abs(totalWeight - 1.0) > 0.01) {
    // 정규화
    const normalizationFactor = 1.0 / totalWeight;
    sotpWeights.dcfWeight! *= normalizationFactor;
    sotpWeights.srimWeight! *= normalizationFactor;
    sotpWeights.pbrWeight! *= normalizationFactor;
    sotpWeights.perWeight! *= normalizationFactor;
    sotpWeights.evEbitdaWeight! *= normalizationFactor;
  }

  return {
    industry: 'other', // 복합 기업은 'other'로 분류
    dcfWeight: sotpWeights.dcfWeight!,
    srimWeight: sotpWeights.srimWeight!,
    pbrWeight: sotpWeights.pbrWeight!,
    perWeight: sotpWeights.perWeight!,
    evEbitdaWeight: sotpWeights.evEbitdaWeight!,
    get totalWeight() {
      return this.dcfWeight + this.srimWeight + this.pbrWeight +
             this.perWeight + this.evEbitdaWeight;
    },
    industryComposition,
    isConglomerate: true,
    appliedIndustries,
  };
}

/**
 * 재무제표에서 산업 구성 추출 (간단한 휴리스틱)
 * 실제로는 더 정교한 분석이 필요할 수 있음
 */
export function detectIndustryComposition(
  financialStatement: any,
  primaryIndustry: IndustryType
): IndustryRevenueShare[] {
  // 기본적으로 단일 산업으로 반환
  // 향후 재무제표의 세그먼트 정보를 분석하여 확장 가능
  return [
    {
      industry: primaryIndustry,
      revenueShare: 1.0,
    },
  ];
}
