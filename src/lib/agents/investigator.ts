/**
 * The Investigator 에이전트
 * XBRL-PDF 크로스 검증 및 MD&A 질적 분석
 */

import type { FinancialStatement } from '@/types/financial';

/**
 * XBRL 항목과 PDF 주석 매핑
 */
export interface XBRLPDFMapping {
  /** XBRL 항목명 */
  xbrlItem: string;
  
  /** XBRL 값 */
  xbrlValue: number;
  
  /** PDF 주석 페이지 번호 */
  pdfPageNumber?: number;
  
  /** PDF 주석 섹션 제목 */
  pdfSectionTitle?: string;
  
  /** 매핑 신뢰도 (0-1) */
  confidence: number;
  
  /** 매핑된 PDF 텍스트 일부 */
  pdfExcerpt?: string;
}

/**
 * MD&A 질적 분석 결과
 */
export interface MDAAnalysis {
  /** 구체적 숫자 비중 (%) */
  concreteNumbersRatio: number;
  
  /** 추상적 형용사 비중 (%) */
  abstractAdjectivesRatio: number;
  
  /** 경영진 언어 주의 플래그 */
  warning: boolean;
  
  /** 경고 메시지 */
  warningMessage?: string;
  
  /** 분석된 구체적 숫자 예시 */
  concreteNumbersExamples: string[];
  
  /** 분석된 추상적 형용사 예시 */
  abstractAdjectivesExamples: string[];
}

/**
 * 크로스 검증 결과
 */
export interface CrossValidationResult {
  /** 매핑된 항목 목록 */
  mappings: XBRLPDFMapping[];
  
  /** 매핑 성공률 (%) */
  mappingSuccessRate: number;
  
  /** 검증 실패 항목 */
  failedItems: string[];
}

/**
 * XBRL 항목을 PDF 주석과 매핑
 */
export function mapXBRLToPDFNotes(
  xbrlItems: Array<{ name: string; value: number; originalName: string }>,
  pdfText: string,
  pdfPageMap?: Map<number, string> // 페이지 번호 -> 텍스트 매핑
): XBRLPDFMapping[] {
  const mappings: XBRLPDFMapping[] = [];
  
  // 주요 항목 키워드 매핑 (한글/영문)
  const keywordMap: Record<string, string[]> = {
    '재고자산': ['재고자산', '재고', 'inventory', 'Inventory'],
    '매출채권': ['매출채권', '외상매출금', 'accounts receivable', 'Accounts Receivable'],
    '유형자산': ['유형자산', '토지', '건물', 'PP&E', 'Property, Plant and Equipment'],
    '무형자산': ['무형자산', '영업권', '상표권', 'Intangible Assets', 'Goodwill'],
    '부채총계': ['부채총계', '총부채', 'Total Liabilities'],
    '자본총계': ['자본총계', '총자본', 'Total Equity'],
  };
  
  for (const item of xbrlItems) {
    const keywords = keywordMap[item.name] || [item.name, item.originalName];
    let bestMatch: XBRLPDFMapping | null = null;
    let bestConfidence = 0;
    
    // PDF 텍스트에서 키워드 검색
    for (const keyword of keywords) {
      const regex = new RegExp(keyword, 'gi');
      const matches = pdfText.match(regex);
      
      if (matches && matches.length > 0) {
        // 키워드 주변 텍스트 추출
        const index = pdfText.toLowerCase().indexOf(keyword.toLowerCase());
        if (index !== -1) {
          const start = Math.max(0, index - 100);
          const end = Math.min(pdfText.length, index + keyword.length + 100);
          const excerpt = pdfText.substring(start, end);
          
          // 페이지 번호 찾기 (간단한 휴리스틱)
          let pageNumber: number | undefined;
          if (pdfPageMap) {
            for (const [page, text] of pdfPageMap.entries()) {
              if (text.includes(keyword)) {
                pageNumber = page;
                break;
              }
            }
          }
          
          // 신뢰도 계산 (키워드 일치, 주변 컨텍스트 등)
          const confidence = Math.min(0.9, 0.5 + (matches.length * 0.1));
          
          if (confidence > bestConfidence) {
            bestMatch = {
              xbrlItem: item.name,
              xbrlValue: item.value,
              pdfPageNumber: pageNumber,
              pdfSectionTitle: extractSectionTitle(excerpt),
              confidence,
              pdfExcerpt: excerpt.trim()
            };
            bestConfidence = confidence;
          }
        }
      }
    }
    
    if (bestMatch) {
      mappings.push(bestMatch);
    }
  }
  
  return mappings;
}

/**
 * 섹션 제목 추출 (간단한 휴리스틱)
 */
function extractSectionTitle(text: string): string | undefined {
  // "제X장", "X. 제목" 등의 패턴 찾기
  const patterns = [
    /제\s*\d+\s*장[:\s]+(.+?)(?:\n|$)/,
    /\d+\.\s*(.+?)(?:\n|$)/,
    /^(.+?)(?:\n|$)/m
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

/**
 * MD&A 섹션 질적 분석
 * 구체적 숫자 vs 추상적 형용사 비중 분석
 */
export function analyzeMDALanguage(mdaText: string): MDAAnalysis {
  // 구체적 숫자 패턴 (예: "10% 증가", "1,234억원", "3년간")
  const concreteNumberPatterns = [
    /\d+[%％]/g, // 퍼센트
    /\d+[억만원]/g, // 금액
    /\d+년/g, // 기간
    /\d+\.\d+/g, // 소수점
    /[+-]?\d{1,3}(?:,\d{3})+/g, // 천단위 구분 숫자
  ];
  
  // 추상적 형용사 패턴 (예: "크게", "상당히", "안정적으로")
  const abstractAdjectives = [
    '크게', '상당히', '많이', '적게', '안정적으로', '지속적으로',
    '급격히', '점진적으로', '현저히', '대폭', '소폭',
    'significantly', 'substantially', 'considerably', 'moderately',
    'steadily', 'gradually', 'rapidly', 'dramatically'
  ];
  
  // 구체적 숫자 찾기
  const concreteNumbers: string[] = [];
  for (const pattern of concreteNumberPatterns) {
    const matches = mdaText.match(pattern);
    if (matches) {
      concreteNumbers.push(...matches);
    }
  }
  
  // 추상적 형용사 찾기
  const abstractAdjectivesFound: string[] = [];
  for (const adj of abstractAdjectives) {
    const regex = new RegExp(adj, 'gi');
    const matches = mdaText.match(regex);
    if (matches) {
      abstractAdjectivesFound.push(...matches);
    }
  }
  
  // 전체 단어 수 계산 (대략적)
  const totalWords = mdaText.split(/\s+/).length;
  const concreteNumbersRatio = totalWords > 0 
    ? (concreteNumbers.length / totalWords) * 100 
    : 0;
  const abstractAdjectivesRatio = totalWords > 0
    ? (abstractAdjectivesFound.length / totalWords) * 100
    : 0;
  
  // 경고 플래그: 구체적 숫자 비중이 줄고 추상적 형용사가 늘어날 경우
  const warning = concreteNumbersRatio < 5 && abstractAdjectivesRatio > 10;
  
  let warningMessage: string | undefined;
  if (warning) {
    warningMessage = `MD&A에서 구체적 숫자 비중(${concreteNumbersRatio.toFixed(2)}%)이 낮고 추상적 형용사 비중(${abstractAdjectivesRatio.toFixed(2)}%)이 높습니다. 경영진의 의견이 모호할 수 있습니다.`;
  }
  
  return {
    concreteNumbersRatio,
    abstractAdjectivesRatio,
    warning,
    warningMessage,
    concreteNumbersExamples: [...new Set(concreteNumbers)].slice(0, 10),
    abstractAdjectivesExamples: [...new Set(abstractAdjectivesFound)].slice(0, 10)
  };
}

/**
 * 크로스 검증 실행
 */
export function performCrossValidation(
  xbrlItems: Array<{ name: string; value: number; originalName: string }>,
  pdfText: string,
  pdfPageMap?: Map<number, string>
): CrossValidationResult {
  const mappings = mapXBRLToPDFNotes(xbrlItems, pdfText, pdfPageMap);
  
  const mappingSuccessRate = xbrlItems.length > 0
    ? (mappings.length / xbrlItems.length) * 100
    : 0;
  
  const mappedItemNames = new Set(mappings.map(m => m.xbrlItem));
  const failedItems = xbrlItems
    .filter(item => !mappedItemNames.has(item.name))
    .map(item => item.name);
  
  return {
    mappings,
    mappingSuccessRate,
    failedItems
  };
}
