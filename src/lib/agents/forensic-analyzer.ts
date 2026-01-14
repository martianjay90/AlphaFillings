/**
 * 포렌식 분석기
 * 숫자-주석 일치성 검증 및 MD&A 질적 뉘앙스 분석
 */

import type { FinancialStatement } from '@/types/financial';

/**
 * 숫자-주석 일치성 검증 결과
 */
export interface NumberNoteConsistencyCheck {
  /** 검증 항목 */
  item: string;
  
  /** XBRL 값 */
  xbrlValue: number;
  
  /** PDF 주석에서 찾은 값 */
  pdfValue?: number;
  
  /** 일치 여부 */
  consistent: boolean;
  
  /** 불일치 사유 */
  inconsistencyReason?: string;
  
  /** PDF 주석 텍스트 일부 */
  pdfExcerpt?: string;
  
  /** 페이지 번호 */
  pageNumber?: number;
}

/**
 * MD&A 질적 뉘앙스 분석 결과
 */
export interface MDANuanceAnalysis {
  /** 불확실성 단어 빈도 */
  uncertaintyWords: {
    count: number;
    examples: string[];
  };
  
  /** 일시적 단어 빈도 */
  temporaryWords: {
    count: number;
    examples: string[];
  };
  
  /** 조정 단어 빈도 */
  adjustmentWords: {
    count: number;
    examples: string[];
  };
  
  /** 전체 단어 수 */
  totalWords: number;
  
  /** 경영진 언어 희석 점수 (0-100, 높을수록 의심) */
  dilutionScore: number;
  
  /** 경고 여부 */
  warning: boolean;
  
  /** 경고 메시지 */
  warningMessage?: string;
}

/**
 * 포렌식 분석 결과
 */
export interface ForensicAnalysisResult {
  /** 숫자-주석 일치성 검증 */
  numberNoteConsistency: NumberNoteConsistencyCheck[];
  
  /** MD&A 질적 뉘앙스 분석 */
  mdaNuance: MDANuanceAnalysis;
  
  /** 전체 경고 수 */
  totalWarnings: number;
}

/**
 * 포렌식 분석기
 */
export class ForensicAnalyzer {
  /**
   * 매출채권 급증과 대손충당금 설정 검증
   */
  async verifyAccountsReceivableAndAllowance(
    accountsReceivable: number,
    previousAccountsReceivable: number,
    pdfText: string,
    pageMap?: Map<number, string>
  ): Promise<NumberNoteConsistencyCheck> {
    const growthRate = previousAccountsReceivable > 0
      ? ((accountsReceivable - previousAccountsReceivable) / previousAccountsReceivable) * 100
      : 0;
    
    const isRapidIncrease = growthRate > 30; // 30% 이상 증가
    
    if (!isRapidIncrease) {
      return {
        item: '매출채권',
        xbrlValue: accountsReceivable,
        consistent: true,
      };
    }
    
    // PDF에서 대손충당금 관련 주석 검색
    const allowanceKeywords = [
      '대손충당금',
      '대손상각비',
      '매출채권 대손',
      'allowance for doubtful accounts',
      'bad debt allowance',
    ];
    
    let pdfExcerpt: string | undefined;
    let pageNumber: number | undefined;
    let foundAllowance = false;
    
    for (const keyword of allowanceKeywords) {
      const index = pdfText.toLowerCase().indexOf(keyword.toLowerCase());
      if (index !== -1) {
        foundAllowance = true;
        const start = Math.max(0, index - 200);
        const end = Math.min(pdfText.length, index + keyword.length + 200);
        pdfExcerpt = pdfText.substring(start, end);
        
        // 페이지 번호 찾기
        if (pageMap) {
          for (const [page, text] of pageMap.entries()) {
            if (text.includes(keyword)) {
              pageNumber = page;
              break;
            }
          }
        }
        break;
      }
    }
    
    return {
      item: '매출채권',
      xbrlValue: accountsReceivable,
      consistent: foundAllowance,
      inconsistencyReason: foundAllowance
        ? undefined
        : '매출채권이 급증했으나 대손충당금 설정에 대한 설명이 없습니다.',
      pdfExcerpt,
      pageNumber,
    };
  }

  /**
   * MD&A 질적 뉘앙스 분석
   */
  analyzeMDANuance(mdaText: string): MDANuanceAnalysis {
    // 불확실성 단어
    const uncertaintyWords = [
      '불확실', '불확실성', '불명확', '예측 어려움',
      'uncertainty', 'uncertain', 'unclear', 'unpredictable',
    ];
    
    // 일시적 단어
    const temporaryWords = [
      '일시적', '임시적', '단기적', '일부',
      'temporary', 'temporarily', 'short-term', 'partial',
    ];
    
    // 조정 단어
    const adjustmentWords = [
      '조정', '재조정', '변경', '수정',
      'adjustment', 'adjust', 'modification', 'revision',
    ];
    
    const foundUncertainty: string[] = [];
    const foundTemporary: string[] = [];
    const foundAdjustment: string[] = [];
    
    // 단어 검색
    for (const word of uncertaintyWords) {
      const regex = new RegExp(word, 'gi');
      const matches = mdaText.match(regex);
      if (matches) {
        foundUncertainty.push(...matches);
      }
    }
    
    for (const word of temporaryWords) {
      const regex = new RegExp(word, 'gi');
      const matches = mdaText.match(regex);
      if (matches) {
        foundTemporary.push(...matches);
      }
    }
    
    for (const word of adjustmentWords) {
      const regex = new RegExp(word, 'gi');
      const matches = mdaText.match(regex);
      if (matches) {
        foundAdjustment.push(...matches);
      }
    }
    
    const totalWords = mdaText.split(/\s+/).length;
    
    // 희석 점수 계산 (단어 빈도 기반)
    const uncertaintyRatio = totalWords > 0 ? (foundUncertainty.length / totalWords) * 100 : 0;
    const temporaryRatio = totalWords > 0 ? (foundTemporary.length / totalWords) * 100 : 0;
    const adjustmentRatio = totalWords > 0 ? (foundAdjustment.length / totalWords) * 100 : 0;
    
    const dilutionScore = Math.min(100, (uncertaintyRatio * 2 + temporaryRatio * 1.5 + adjustmentRatio * 1.5));
    
    const warning = dilutionScore > 15; // 15점 이상이면 경고
    
    let warningMessage: string | undefined;
    if (warning) {
      warningMessage = `MD&A에서 불확실성(${foundUncertainty.length}회), 일시적(${foundTemporary.length}회), 조정(${foundAdjustment.length}회) 관련 단어가 빈번하게 사용되어 경영진이 실적 부진을 언어로 희석하려는 의도가 의심됩니다.`;
    }
    
    return {
      uncertaintyWords: {
        count: foundUncertainty.length,
        examples: [...new Set(foundUncertainty)].slice(0, 5),
      },
      temporaryWords: {
        count: foundTemporary.length,
        examples: [...new Set(foundTemporary)].slice(0, 5),
      },
      adjustmentWords: {
        count: foundAdjustment.length,
        examples: [...new Set(foundAdjustment)].slice(0, 5),
      },
      totalWords,
      dilutionScore,
      warning,
      warningMessage,
    };
  }

  /**
   * 종합 포렌식 분석
   */
  async performForensicAnalysis(
    current: FinancialStatement,
    previous?: FinancialStatement,
    pdfText?: string,
    mdaText?: string,
    pageMap?: Map<number, string>
  ): Promise<ForensicAnalysisResult> {
    const numberNoteConsistency: NumberNoteConsistencyCheck[] = [];
    
    // 매출채권 검증
    if (current.balanceSheet.accountsReceivable && previous?.balanceSheet.accountsReceivable && pdfText) {
      const arCheck = await this.verifyAccountsReceivableAndAllowance(
        current.balanceSheet.accountsReceivable.value,
        previous.balanceSheet.accountsReceivable.value,
        pdfText,
        pageMap
      );
      numberNoteConsistency.push(arCheck);
    }
    
    // MD&A 분석
    const mdaNuance = mdaText ? this.analyzeMDANuance(mdaText) : {
      uncertaintyWords: { count: 0, examples: [] },
      temporaryWords: { count: 0, examples: [] },
      adjustmentWords: { count: 0, examples: [] },
      totalWords: 0,
      dilutionScore: 0,
      warning: false,
    };
    
    const totalWarnings = numberNoteConsistency.filter(c => !c.consistent).length +
      (mdaNuance.warning ? 1 : 0);
    
    return {
      numberNoteConsistency,
      mdaNuance,
      totalWarnings,
    };
  }
}

/**
 * 포렌식 분석기 인스턴스
 */
export const forensicAnalyzer = new ForensicAnalyzer();
