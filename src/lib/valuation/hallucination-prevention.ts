/**
 * 환각 방지 시스템
 * AI 분석 내용의 원문 근거 검증
 */

import type { FinancialStatement } from '@/types/financial';

/**
 * 근거 소스
 */
export interface EvidenceSource {
  /** 소스 타입 */
  type: 'XBRL' | 'PDF' | 'SEC_FILING';
  
  /** 소스 위치 */
  location: {
    page?: number;
    section?: string;
    elementId?: string;
    xbrlItem?: string;
  };
  
  /** 원문 텍스트 일부 */
  excerpt: string;
  
  /** 신뢰도 (0-1) */
  confidence: number;
}

/**
 * 분석 문장과 근거
 */
export interface AnalyzedSentence {
  /** 문장 ID */
  id: string;
  
  /** 문장 텍스트 */
  text: string;
  
  /** 근거 소스 목록 */
  evidenceSources: EvidenceSource[];
  
  /** 근거 확인 여부 */
  verified: boolean;
  
  /** 검증 실패 사유 */
  verificationFailureReason?: string;
}

/**
 * 리포트 검증 결과
 */
export interface ReportVerificationResult {
  /** 검증된 문장 목록 */
  verifiedSentences: AnalyzedSentence[];
  
  /** 검증 실패 문장 목록 */
  unverifiedSentences: AnalyzedSentence[];
  
  /** 검증률 (%) */
  verificationRate: number;
  
  /** 전체 문장 수 */
  totalSentences: number;
}

/**
 * 문장에서 주장 추출 및 근거 검증
 */
export function verifySentence(
  sentence: string,
  sentenceId: string,
  xbrlData?: Record<string, number>,
  pdfText?: string,
  sourceDocuments?: Array<{ type: string; content: string; pageMap?: Map<number, string> }>
): AnalyzedSentence {
  const evidenceSources: EvidenceSource[] = [];
  
  // 숫자 주장 추출 (예: "ROIC는 15%입니다")
  const numberClaims = extractNumberClaims(sentence);
  
  // 각 주장에 대해 근거 찾기
  for (const claim of numberClaims) {
    // XBRL 데이터에서 검색
    if (xbrlData) {
      for (const [key, value] of Object.entries(xbrlData)) {
        if (isValueMatch(claim.value, value, claim.tolerance || 0.01)) {
          evidenceSources.push({
            type: 'XBRL',
            location: { xbrlItem: key },
            excerpt: `${key}: ${value}`,
            confidence: 0.9
          });
        }
      }
    }
    
    // PDF 텍스트에서 검색
    if (pdfText) {
      const searchTerm = claim.term || String(claim.value);
      if (pdfText.includes(searchTerm)) {
        const index = pdfText.indexOf(searchTerm);
        const excerpt = pdfText.substring(
          Math.max(0, index - 100),
          Math.min(pdfText.length, index + searchTerm.length + 100)
        );
        
        evidenceSources.push({
          type: 'PDF',
          location: {},
          excerpt: excerpt.trim(),
          confidence: 0.7
        });
      }
    }
  }
  
  // 키워드 기반 근거 찾기
  const keywords = extractKeywords(sentence);
  for (const keyword of keywords) {
    if (pdfText && pdfText.includes(keyword)) {
      const index = pdfText.indexOf(keyword);
      const excerpt = pdfText.substring(
        Math.max(0, index - 150),
        Math.min(pdfText.length, index + keyword.length + 150)
      );
      
      evidenceSources.push({
        type: 'PDF',
        location: {},
        excerpt: excerpt.trim(),
        confidence: 0.6
      });
    }
  }
  
  // 근거 확인 여부
  const verified = evidenceSources.length > 0 && 
    evidenceSources.some(e => e.confidence >= 0.7);
  
  let verificationFailureReason: string | undefined;
  if (!verified) {
    verificationFailureReason = '원본 데이터에서 해당 주장의 근거를 찾을 수 없습니다.';
  }
  
  return {
    id: sentenceId,
    text: sentence,
    evidenceSources,
    verified,
    verificationFailureReason
  };
}

/**
 * 숫자 주장 추출
 */
interface NumberClaim {
  term?: string;
  value: number;
  tolerance?: number;
}

function extractNumberClaims(sentence: string): NumberClaim[] {
  const claims: NumberClaim[] = [];
  
  // 퍼센트 패턴 (예: "15%", "10.5%")
  const percentPattern = /(\d+\.?\d*)\s*[%％]/g;
  let match;
  while ((match = percentPattern.exec(sentence)) !== null) {
    claims.push({
      value: parseFloat(match[1]) / 100,
      tolerance: 0.001
    });
  }
  
  // 금액 패턴 (예: "1,234억원", "100만원")
  const amountPattern = /(\d{1,3}(?:,\d{3})*)\s*(억|만|천)?\s*원/g;
  while ((match = amountPattern.exec(sentence)) !== null) {
    let value = parseFloat(match[1].replace(/,/g, ''));
    if (match[2] === '억') value *= 100000000;
    else if (match[2] === '만') value *= 10000;
    else if (match[2] === '천') value *= 1000;
    
    claims.push({
      term: match[0],
      value,
      tolerance: value * 0.01 // 1% 허용 오차
    });
  }
  
  return claims;
}

/**
 * 값 매칭 확인
 */
function isValueMatch(
  claimValue: number,
  actualValue: number,
  tolerance: number
): boolean {
  return Math.abs(claimValue - actualValue) <= tolerance;
}

/**
 * 키워드 추출
 */
function extractKeywords(sentence: string): string[] {
  // 주요 재무 용어
  const financialTerms = [
    'ROIC', 'ROE', 'ROA', 'EPS', 'FCF', 'OCF', 'CAPEX',
    '매출', '영업이익', '순이익', '자산', '부채', '자본',
    '재고', '매출채권', '현금흐름'
  ];
  
  const found: string[] = [];
  for (const term of financialTerms) {
    if (sentence.includes(term)) {
      found.push(term);
    }
  }
  
  return found;
}

/**
 * 리포트 전체 검증
 */
export function verifyReport(
  sentences: string[],
  xbrlData?: Record<string, number>,
  pdfText?: string,
  sourceDocuments?: Array<{ type: string; content: string; pageMap?: Map<number, string> }>
): ReportVerificationResult {
  const verifiedSentences: AnalyzedSentence[] = [];
  const unverifiedSentences: AnalyzedSentence[] = [];
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceId = `sentence-${i}`;
    
    const verified = verifySentence(
      sentence,
      sentenceId,
      xbrlData,
      pdfText,
      sourceDocuments
    );
    
    if (verified.verified) {
      verifiedSentences.push(verified);
    } else {
      unverifiedSentences.push(verified);
    }
  }
  
  const totalSentences = sentences.length;
  const verificationRate = totalSentences > 0
    ? (verifiedSentences.length / totalSentences) * 100
    : 0;
  
  return {
    verifiedSentences,
    unverifiedSentences,
    verificationRate,
    totalSentences
  };
}

/**
 * 검증 실패 문장 필터링
 * 근거가 없는 문장은 리포트에서 제외
 */
export function filterUnverifiedSentences(
  verificationResult: ReportVerificationResult
): string[] {
  return verificationResult.verifiedSentences.map(s => s.text);
}
