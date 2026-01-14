/**
 * 논리적 브리핑 시스템
 * "왜?"라는 질문에 답하는 텍스트 브리핑 자동 생성
 */

import type { FinancialStatement } from '@/types/financial';
import type { IndustryType } from '@/types/industry';
import { calculateROIC } from './engine';
import { checkEarningsQuality, checkWorkingCapitalTrap, calculateCapitalAllocationScore } from './forensic';
import { calculateFCFRange } from './advanced';
import { INDUSTRY_WEIGHTS, INDUSTRY_NAMES, getIndustryWeights, UNIVERSAL_WEIGHTS } from '@/types/industry';

/**
 * 브리핑 섹션
 */
export interface BriefingSection {
  /** 섹션 제목 */
  title: string;
  
  /** 브리핑 내용 */
  content: string;
  
  /** 중요도 (high, medium, low) */
  priority: 'high' | 'medium' | 'low';
  
  /** 경고 여부 */
  warning?: boolean;
}

/**
 * 종합 브리핑 결과
 */
export interface BriefingResult {
  /** 회사명 */
  companyName: string;
  
  /** 산업군 */
  industry: IndustryType;
  
  /** 브리핑 섹션 목록 */
  sections: BriefingSection[];
  
  /** 요약 (한 문장) */
  summary: string;
}

/**
 * 논리적 브리핑 생성
 */
export function generateBriefing(
  financialStatement: FinancialStatement,
  previousYear?: FinancialStatement,
  industry: IndustryType | { label: string; confidence: number; evidence?: Array<{ source: string; excerpt?: string }> } = 'other', // 레거시 IndustryType 또는 IndustryClassification
  useUniversalWeights: boolean = false,
  dataQuality?: { missingConcepts?: string[]; blockedMetrics?: string[] } // AnalysisBundle의 dataQuality 정보
): BriefingResult {
  const sections: BriefingSection[] = [];
  
  // industry가 IndustryClassification 객체인지 확인
  // IndustryClassification인 경우 label을 IndustryType으로 매핑 시도, 실패 시 'other' 사용
  let industryType: IndustryType = 'other'
  if (industry && typeof industry === 'object' && 'label' in industry) {
    // IndustryClassification인 경우: label을 IndustryType으로 매핑 시도
    const classification = industry as { label: string; confidence: number; evidence?: Array<{ source: string; excerpt?: string }> }
    const label = classification.label || ''
    // label이 "산업 미확인"이거나 confidence가 낮으면 'other' 사용 (weights는 범용 가이드라인)
    if (label === '산업 미확인' || classification.confidence < 0.5) {
      industryType = 'other'
    } else {
      // label을 IndustryType으로 매핑 시도 (간단 버전: manufacturing, it, finance 등)
      const labelLower = label.toLowerCase()
      if (labelLower.includes('제조')) industryType = 'manufacturing'
      else if (labelLower.includes('it') || labelLower.includes('소프트웨어')) industryType = 'it'
      else if (labelLower.includes('금융') || labelLower.includes('은행')) industryType = 'finance'
      else if (labelLower.includes('바이오') || labelLower.includes('제약')) industryType = 'bio'
      else if (labelLower.includes('유통') || labelLower.includes('소매')) industryType = 'retail'
      else if (labelLower.includes('에너지') || labelLower.includes('화학')) industryType = 'energy'
      else if (labelLower.includes('건설')) industryType = 'construction'
      else if (labelLower.includes('서비스')) industryType = 'service'
      else industryType = 'other'
    }
  } else {
    industryType = (industry as IndustryType) || 'other'
  }
  
  // 산업군 예외 처리: 범용 가이드라인 사용 여부 확인
  const weights = getIndustryWeights(industryType);
  const isUsingUniversalWeights = useUniversalWeights || weights === UNIVERSAL_WEIGHTS;
  
  if (isUsingUniversalWeights && industryType !== 'other') {
    sections.push({
      title: '가중치 적용 안내',
      content: '선택하신 산업군에 대한 표준 가중치가 적용되었습니다. 복합 기업의 경우 SOTP(Sum of the Parts) 가중치를 사용할 수 있습니다.',
      priority: 'low',
    });
  }
  
  try {
    // 1. ROIC 분석 (dataQuality를 통해 계산 가능 여부 확인)
    const roicResult = calculateROIC(financialStatement);
    const hasROIC = dataQuality?.blockedMetrics?.includes('ROIC') === false || 
                    (dataQuality?.blockedMetrics === undefined && roicResult.roic !== undefined);
    
    // ROIC가 계산 가능한 경우에만 섹션 추가
    if (hasROIC && roicResult.roic !== undefined) {
      const industryAvg = getIndustryAverageROIC(industryType);
      
      let roicContent = `이 기업의 ROIC는 ${roicResult.roic.toFixed(2)}%로, `;
      if (roicResult.roic > industryAvg * 1.2) {
        roicContent += `산업 평균(${industryAvg.toFixed(2)}%) 대비 크게 높아 자본 효율성이 우수합니다.`;
      } else if (roicResult.roic > industryAvg) {
        roicContent += `산업 평균(${industryAvg.toFixed(2)}%)보다 높아 양호한 수준입니다.`;
      } else if (roicResult.roic > industryAvg * 0.8) {
        roicContent += `산업 평균(${industryAvg.toFixed(2)}%)과 비슷한 수준입니다.`;
      } else {
        roicContent += `산업 평균(${industryAvg.toFixed(2)}%)보다 낮아 자본 효율성 개선이 필요합니다.`;
      }
      
      sections.push({
        title: '자본 효율성 (ROIC)',
        content: roicContent,
        priority: 'high'
      });
    }
    
    // 2. FCF 범위 분석
    const fcfRange = calculateFCFRange(financialStatement);
    const ocf = financialStatement.cashFlowStatement.operatingCashFlow.value;
    
    let fcfContent = `영업현금흐름 대비 FCF 범위는 ${fcfRange.fcfMin.toLocaleString()} ~ ${fcfRange.fcfMax.toLocaleString()}입니다. `;
    if (fcfRange.fcfMax < 0) {
      fcfContent += `FCF가 음수로 전환되어 현금 창출 능력에 우려가 있습니다.`;
      sections.push({
        title: '현금흐름 분석',
        content: fcfContent,
        priority: 'high',
        warning: true
      });
    } else if (fcfRange.fcfMin < 0) {
      fcfContent += `유지보수 CAPEX를 고려할 때 일부 시나리오에서 FCF가 음수로 전환될 수 있어 주의가 필요합니다.`;
      sections.push({
        title: '현금흐름 분석',
        content: fcfContent,
        priority: 'medium',
        warning: true
      });
    } else {
      fcfContent += `유지보수 CAPEX 범위(${fcfRange.maintenanceCapex.min.toLocaleString()} ~ ${fcfRange.maintenanceCapex.max.toLocaleString()})를 고려해도 FCF가 양수로 유지되어 현금 창출 능력이 안정적입니다.`;
      sections.push({
        title: '현금흐름 분석',
        content: fcfContent,
        priority: 'medium'
      });
    }
    
    // 3. 이익의 질 분석
    if (previousYear) {
      const earningsQuality = checkEarningsQuality(financialStatement, previousYear);
      
      if (earningsQuality.warning) {
        sections.push({
          title: '이익의 질',
          content: earningsQuality.warningMessage || 'EPS와 OCF 성장률 간 괴리가 발견되었습니다.',
          priority: 'high',
          warning: true
        });
      } else {
        sections.push({
          title: '이익의 질',
          content: `EPS 성장률(${earningsQuality.epsGrowthRate.toFixed(2)}%)과 OCF 성장률(${earningsQuality.ocfGrowthRate.toFixed(2)}%)이 일치하여 이익의 질이 양호합니다.`,
          priority: 'medium'
        });
      }
    }
    
    // 4. 운전자본 트랩 분석
    if (previousYear) {
      const workingCapitalTrap = checkWorkingCapitalTrap(financialStatement, previousYear);
      
      if (workingCapitalTrap.suspicious) {
        sections.push({
          title: '운전자본 분석',
          content: workingCapitalTrap.suspicionReason || '매출 대비 운전자본 증가율이 비정상적으로 높습니다.',
          priority: 'high',
          warning: true
        });
      }
    }
    
    // 5. 자본배분 점수
    const capitalAllocation = calculateCapitalAllocationScore(financialStatement);
    
    let capitalContent = `자본배분 점수는 ${capitalAllocation.score.toFixed(0)}점(${getEvaluationText(capitalAllocation.evaluation)})입니다. `;
    capitalContent += `CAPEX 대비 FCF 비율이 ${capitalAllocation.fcfToCapexRatio.toFixed(2)}로, `;
    if (capitalAllocation.evaluation === 'excellent') {
      capitalContent += `투자 대비 현금 창출 능력이 매우 우수합니다.`;
    } else if (capitalAllocation.evaluation === 'good') {
      capitalContent += `투자 대비 현금 창출 능력이 양호합니다.`;
    } else if (capitalAllocation.evaluation === 'fair') {
      capitalContent += `투자 대비 현금 창출 능력이 보통 수준입니다.`;
    } else {
      capitalContent += `투자 대비 현금 창출 능력이 개선이 필요합니다.`;
    }
    
    sections.push({
      title: '자본배분 효율성',
      content: capitalContent,
      priority: 'medium'
    });
    
  } catch (error) {
    // 추정 금지 정책: 데이터 부족 시 "데이터 부족" 안내만 제공
    const errorMessage = error instanceof Error ? error.message : '분석 중 오류가 발생했습니다.'
    
    // ROIC/투하자본 계산 가능 여부 확인 (dataQuality 정보 사용)
    // blockedMetrics에 ROIC가 없으면 계산 가능
    const hasROIC = dataQuality?.blockedMetrics === undefined || 
                    !dataQuality.blockedMetrics.includes('ROIC')
    
    // 기본 분석 시도 (데이터가 일부라도 있는 경우)
    if (financialStatement.incomeStatement.revenue.value > 0 || financialStatement.balanceSheet.totalAssets.value > 0) {
      // dataQuality 정보가 있으면 구체적인 부족 데이터 표시
      const missingConceptsCount = dataQuality?.missingConcepts?.length || 0
      const blockedMetricsCount = dataQuality?.blockedMetrics?.length || 0
      if (dataQuality && (missingConceptsCount > 0 || blockedMetricsCount > 0)) {
        const missingConcepts = dataQuality.missingConcepts || []
        const blockedMetrics = dataQuality.blockedMetrics || []
        
        let content = ''
        if (missingConcepts.length > 0) {
          content += `부족한 필수 데이터: ${missingConcepts.join(', ')}. `
        }
        if (blockedMetrics.length > 0) {
          content += `계산 불가 지표: ${blockedMetrics.join(', ')}. `
        }
        content += '데이터 부족으로 일부 항목은 계산하지 않았습니다.'
        
        sections.push({
          title: '제한적 분석 결과',
          content,
          priority: 'medium',
          warning: false
        })
      } else if (!hasROIC) {
        // dataQuality 정보가 없지만 ROIC가 없는 경우 기본 메시지
        sections.push({
          title: '제한적 분석 결과',
          content: '데이터 부족으로 일부 항목은 계산하지 않았습니다. 계산 불가 지표: ROIC/투하자본 (필수 데이터 부족).',
          priority: 'medium',
          warning: false
        })
      }
    } else {
      sections.push({
        title: '분석 오류',
        content: errorMessage,
        priority: 'high',
        warning: true
      })
    }
  }
  
  // companyName이 undefined가 되지 않도록 보장
  const finalCompanyName = (financialStatement.companyName && 
                            typeof financialStatement.companyName === 'string' &&
                            financialStatement.companyName !== 'undefined' && 
                            financialStatement.companyName !== 'Unknown Company' &&
                            financialStatement.companyName.trim() !== '')
    ? financialStatement.companyName.trim()
    : '기업명 미확인'
  
  // industry 분류 정보 확인 (AnalysisBundle에서 전달된 경우)
  // industry 파라미터는 레거시 호환용 (IndustryType), 하지만 실제로는 industryClassification이 사용됨
  let industryName = '산업 미확인'
  let industryLabel = '산업 미확인'
  
  // industryClassification이 있으면 사용 (우선순위 높음)
  if (industry && typeof industry === 'object' && 'label' in industry && 'confidence' in industry) {
    const classification = industry as any
    industryLabel = classification.label || '산업 미확인'
    const confidence = classification.confidence || 0
    
    // confidence에 따라 표시
    if (confidence >= 0.7) {
      industryName = industryLabel
    } else if (confidence >= 0.5) {
      industryName = `${industryLabel} (추정)`
    } else {
      industryName = '산업 미확인'
    }
  } else if (industry && typeof industry === 'string' && industry in INDUSTRY_NAMES) {
    // 레거시 IndustryType 사용 (fallback)
    const legacyIndustry = industry as IndustryType
    industryLabel = INDUSTRY_NAMES[legacyIndustry]
    // 'other'는 "기타"가 아니라 "산업 미확인"으로 표시
    if (legacyIndustry === 'other') {
      industryName = '산업 미확인'
      industryLabel = '산업 미확인'
    } else {
      industryName = industryLabel
    }
  } else {
    // 기본값: 산업 미확인 ("기타" 제거)
    industryName = '산업 미확인'
    industryLabel = '산업 미확인'
  }
  
  // 요약 생성 (companyName과 industryName 사용, undefined 방지)
  const warnings = sections.filter(s => s.warning);
  const summary = warnings.length > 0
    ? `${finalCompanyName}은(는) ${industryName}으로, ${warnings.length}개의 주의사항이 발견되었습니다.`
    : `${finalCompanyName}은(는) ${industryName}으로, 전반적인 재무 지표가 양호한 수준입니다.`;
  
  // industry 반환값: IndustryClassification 객체인 경우 industryType으로 변환, 아니면 그대로 반환
  const returnIndustry: IndustryType = (industry && typeof industry === 'object' && 'label' in industry)
    ? industryType // IndustryClassification인 경우 industryType 사용
    : (industry as IndustryType) || 'other'
  
  return {
    companyName: finalCompanyName,
    industry: returnIndustry,
    sections,
    summary
  };
}

/**
 * 산업별 평균 ROIC (예시 값)
 */
function getIndustryAverageROIC(industry: IndustryType): number {
  const averages: Record<IndustryType, number> = {
    manufacturing: 8,
    it: 12,
    finance: 10,
    bio: 15,
    retail: 6,
    energy: 7,
    construction: 5,
    service: 8,
    other: 8,
  };
  
  return averages[industry];
}

/**
 * 평가 텍스트 변환
 */
function getEvaluationText(evaluation: 'excellent' | 'good' | 'fair' | 'poor'): string {
  const texts = {
    excellent: '우수',
    good: '양호',
    fair: '보통',
    poor: '미흡'
  };
  
  return texts[evaluation];
}
