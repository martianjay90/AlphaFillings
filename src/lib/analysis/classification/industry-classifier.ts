/**
 * 산업군 자동 분류 (간단 버전)
 * PDF 텍스트 기반 키워드 점수화로 결정론적 분류
 * 
 * 원칙:
 * - 특정 기업 하드코딩 금지
 * - 결정론적 분류 (동일 입력 → 동일 출력)
 * - confidence 기반 "산업 미확인" 처리
 */

import type { IndustryType } from '@/types/industry';
import type { IndustryClassification } from '@/types/analysis-bundle';
import { isCompareReasonCode } from '@/lib/compare/reasonCodes';
import { extractPDFEvidence } from '@/lib/analysis/evidence/pdf-evidence-extractor';

/**
 * 산업군 키워드 매핑 (점수화)
 * 각 키워드는 해당 산업군에 대한 점수를 부여 (1.0 = 완전 일치, 0.5 = 부분 일치)
 */
const INDUSTRY_KEYWORDS: Record<IndustryType, Array<{ keyword: string; score: number }>> = {
  manufacturing: [
    // 반도체/메모리
    { keyword: '반도체', score: 1.0 },
    { keyword: '메모리', score: 1.0 },
    { keyword: 'DRAM', score: 1.0 },
    { keyword: 'NAND', score: 1.0 },
    { keyword: 'HBM', score: 1.0 },
    { keyword: '파운드리', score: 1.0 },
    // 모바일
    { keyword: '스마트폰', score: 1.0 },
    { keyword: '모바일', score: 1.0 },
    // 디스플레이
    { keyword: '디스플레이', score: 1.0 },
    { keyword: 'OLED', score: 1.0 },
    // 가전
    { keyword: '가전', score: 1.0 },
    { keyword: '전자제품', score: 1.0 },
    { keyword: 'TV', score: 1.0 },
    { keyword: '냉장고', score: 1.0 },
    { keyword: '세탁기', score: 1.0 },
    { keyword: '에어컨', score: 1.0 },
    { keyword: '생활가전', score: 1.0 },
    // 일반 제조
    { keyword: '제조', score: 0.5 },
    { keyword: '제조업', score: 0.5 },
    { keyword: '제조사', score: 0.5 },
  ],
  it: [
    { keyword: '소프트웨어', score: 1.0 },
    { keyword: '플랫폼', score: 0.8 },
    { keyword: '클라우드', score: 1.0 },
    { keyword: 'IT서비스', score: 1.0 },
    { keyword: '정보통신', score: 0.8 },
    { keyword: '정보기술', score: 0.8 },
  ],
  finance: [
    { keyword: '은행', score: 1.0 },
    { keyword: '금융', score: 1.0 },
    { keyword: '보험', score: 1.0 },
    { keyword: '증권', score: 1.0 },
    { keyword: '카드', score: 0.8 },
    { keyword: '리스', score: 0.8 },
  ],
  bio: [
    { keyword: '바이오', score: 1.0 },
    { keyword: '제약', score: 1.0 },
    { keyword: '의약', score: 1.0 },
    { keyword: '생명과학', score: 1.0 },
    { keyword: '백신', score: 1.0 },
    { keyword: '의료기기', score: 0.8 },
  ],
  retail: [
    { keyword: '유통', score: 1.0 },
    { keyword: '소매', score: 1.0 },
    { keyword: '백화점', score: 1.0 },
    { keyword: '마트', score: 1.0 },
    { keyword: '편의점', score: 1.0 },
    { keyword: '온라인몰', score: 0.8 },
  ],
  energy: [
    { keyword: '에너지', score: 1.0 },
    { keyword: '전력', score: 1.0 },
    { keyword: '가스', score: 1.0 },
    { keyword: '석유', score: 1.0 },
    { keyword: '정유', score: 1.0 },
    { keyword: '화학', score: 0.8 },
  ],
  construction: [
    { keyword: '건설', score: 1.0 },
    { keyword: '건축', score: 0.8 },
    { keyword: '토목', score: 0.8 },
    { keyword: '인프라', score: 0.8 },
    { keyword: '부동산개발', score: 0.8 },
  ],
  service: [
    { keyword: '서비스', score: 0.5 },
    { keyword: '운송', score: 0.8 },
    { keyword: '물류', score: 0.8 },
    { keyword: '여행', score: 0.8 },
    { keyword: '호텔', score: 0.8 },
  ],
  other: [
    // "other"는 fallback이므로 키워드 없음
  ],
};

/**
 * 산업군 이름 매핑
 */
const INDUSTRY_LABELS: Record<IndustryType, string> = {
  manufacturing: '제조업',
  it: 'IT/소프트웨어',
  finance: '금융',
  bio: '바이오/제약',
  retail: '유통/소매',
  energy: '에너지/화학',
  construction: '건설',
  service: '서비스',
  other: '기타',
};

/**
 * PDF 텍스트에서 산업군 분류
 * 
 * @param pdfText PDF 텍스트 (사업 개요/주요 제품/세그먼트 섹션 추출)
 * @param companyName 회사명 (선택, 키워드 매칭에 사용 안 함)
 * @param pageMap 페이지 번호 -> 텍스트 매핑 (위치 힌트용, 선택)
 * @param businessSectionPages 사업 관련 섹션 페이지 번호 배열 (가중치 계산용, 선택)
 * @returns IndustryClassification 또는 null
 */
export function classifyIndustryFromPDF(
  pdfText: string,
  companyName?: string,
  pageMap?: Map<number, string> | Record<number, string>,
  businessSectionPages?: number[],
  sectionMap?: Map<number, string> | Record<number, string>,
  headingMap?: Map<number, string> | Record<number, string>
): IndustryClassification | null {
  if (!pdfText || typeof pdfText !== 'string' || pdfText.trim().length === 0) {
    return {
      label: '산업 미확인',
      confidence: 0.0,
      evidence: [{
        source: 'PDF',
        excerpt: 'PDF 텍스트가 없습니다.',
      }],
    };
  }

  // PDF 텍스트를 소문자로 변환 (대소문자 구분 없이 매칭)
  const lowerText = pdfText.toLowerCase();
  
  // 사업 관련 섹션인지 확인하는 함수 (가중치 2배 적용)
  const isBusinessSection = (keywordIndex: number): boolean => {
    if (!businessSectionPages || businessSectionPages.length === 0) return false
    if (!pageMap) return false
    
    // pageMap을 Record로 변환
    const pageMapRecord: Record<number, string> = pageMap instanceof Map
      ? Object.fromEntries(pageMap)
      : pageMap
    
    // 키워드가 포함된 페이지 찾기
    for (const [pageNumStr, pageText] of Object.entries(pageMapRecord)) {
      const pageNum = parseInt(pageNumStr, 10)
      if (isNaN(pageNum)) continue
      const pageStart = pdfText.indexOf(pageText)
      const pageEnd = pageStart + pageText.length
      if (keywordIndex >= pageStart && keywordIndex < pageEnd) {
        return businessSectionPages.includes(pageNum)
      }
    }
    return false
  }
  
  // 각 산업군별 점수 계산
  const industryScores: Array<{ industry: IndustryType; score: number; matchedKeywords: Array<{ keyword: string; score: number; inBusinessSection: boolean }> }> = [];
  
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (industry === 'other') continue; // "other"는 키워드 없음
    
    let totalScore = 0;
    const matchedKeywords: Array<{ keyword: string; score: number; inBusinessSection: boolean }> = [];
    
    for (const { keyword, score } of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      let keywordIndex = lowerText.indexOf(lowerKeyword);
      
      // 키워드가 여러 번 나타날 수 있으므로 모든 출현 위치 확인
      while (keywordIndex !== -1) {
        const inBusinessSection = isBusinessSection(keywordIndex);
        const adjustedScore = inBusinessSection ? score * 2 : score; // 사업 섹션 내 출현이면 가중치 2배
        totalScore += adjustedScore;
        
        // 첫 번째 출현만 기록 (중복 방지)
        if (matchedKeywords.length === 0 || !matchedKeywords.some(k => k.keyword === keyword)) {
          matchedKeywords.push({ keyword, score: adjustedScore, inBusinessSection });
        }
        
        keywordIndex = lowerText.indexOf(lowerKeyword, keywordIndex + 1);
      }
    }
    
    if (totalScore > 0) {
      industryScores.push({
        industry: industry as IndustryType,
        score: totalScore,
        matchedKeywords,
      });
    }
  }
  
  // 점수 기준으로 정렬 (높은 점수 우선)
  industryScores.sort((a, b) => b.score - a.score);
  
  // 최고 점수 산업군 선택
  if (industryScores.length === 0) {
    // 키워드 매칭 실패: 산업 미확인
    return {
      label: '산업 미확인',
      confidence: 0.0,
      evidence: [{
        source: 'PDF',
        excerpt: 'PDF 텍스트에서 산업 관련 키워드를 찾을 수 없습니다.',
      }],
    };
  }
  
  const topIndustry = industryScores[0];
  const secondScore = industryScores.length > 1 ? industryScores[1].score : 0;
  
  // Confidence 계산:
  // - 최고 점수가 3.0 이상이면 confidence = 0.9 (높음)
  // - 최고 점수가 2.0 이상이면 confidence = 0.7 (중간)
  // - 최고 점수가 1.0 이상이면 confidence = 0.5 (낮음)
  // - 최고 점수와 두 번째 점수의 차이가 작으면 confidence 감소
  let confidence = 0.0;
  if (topIndustry.score >= 3.0) {
    confidence = 0.9;
  } else if (topIndustry.score >= 2.0) {
    confidence = 0.7;
  } else if (topIndustry.score >= 1.0) {
    confidence = 0.5;
  } else {
    confidence = 0.3;
  }
  
  // 두 번째 점수와 차이가 작으면 confidence 감소
  if (topIndustry.score - secondScore < 1.0 && secondScore > 0) {
    confidence = Math.max(0.3, confidence - 0.2);
  }
  
  // 주제 라벨 타입 (요구사항에 맞게 수정)
  type TopicLabel = '사업구조' | '시장/수요' | '경쟁' | '가격/원가' | '규제/리스크' | '기타'
  
  // 토픽별 키워드 정의 (요구사항에 맞게 확장)
  const topicKeywords: Record<TopicLabel, string[]> = {
    '사업구조': ['사업', '부문', '제품', '솔루션', '고객', '매출', 'segment', 'DX', 'DS'],
    '시장/수요': ['시장', '수요', '성장', '정체', '둔화', '전망', '교체', '투자'],
    '경쟁': ['경쟁', '점유율', '중국', '업체', '추격', '가격 경쟁', '차별화'],
    '가격/원가': ['가격', '판가', 'ASP', '인상', '하락', '원가', '마진', '비용'],
    '규제/리스크': ['규제', '환경', '인증', '관세', '정책', '리스크', '환율'],
    '기타': [],
  }
  
  // 주제 분류 함수 (키워드 기반)
  const classifyTopic = (sentence: string): TopicLabel => {
    const lowerSentence = sentence.toLowerCase()
    
    // 각 토픽별로 키워드 매칭 확인 (우선순위 순서대로)
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (topic === '기타') continue
      if (keywords.some(kw => lowerSentence.includes(kw.toLowerCase()))) {
        return topic as TopicLabel
      }
    }
    
    return '기타'
  }
  
  // 문장 단위로 split (한국어 종결 기준 포함)
  const splitIntoSentences = (text: string): string[] => {
    // 한국어 문장 종결 패턴: . ! ? 。 ！ ？ 다. 다, 요. 요, 니다. 니다, 합니다. 합니다, 임. 임
    const sentenceEndPattern = /([.!?。！？]|다[.\s,]|요[.\s,]|니다[.\s,]|합니다[.\s,]|임[.\s,])/g
    const sentences: string[] = []
    let lastIndex = 0
    let match
    
    while ((match = sentenceEndPattern.exec(text)) !== null) {
      const sentence = text.substring(lastIndex, match.index + match[0].length).trim()
      if (sentence.length > 0) {
        sentences.push(sentence)
      }
      lastIndex = match.index + match[0].length
    }
    
    // 마지막 문장
    if (lastIndex < text.length) {
      const lastSentence = text.substring(lastIndex).trim()
      if (lastSentence.length > 0) {
        sentences.push(lastSentence)
      }
    }
    
    return sentences.filter(s => s.length > 0)
  }
  
  // 문장 결합 함수 (1~2문장, 최대 220자)
  const combineSentences = (sentences: string[], startIndex: number): string => {
    let combined = sentences[startIndex] || ''
    if (startIndex + 1 < sentences.length) {
      const nextSentence = sentences[startIndex + 1]
      const candidate = combined + ' ' + nextSentence
      if (candidate.length <= 220) {
        combined = candidate
      }
    }
    return combined.trim()
  }
  
  // 잡음 제거 함수
  const removeNoise = (text: string): string => {
    let cleaned = text
      // URL 제거
      .replace(/https?:\/\/[^\s]+/gi, '')
      .replace(/dart\.fss\.or\.kr[^\s]*/gi, '')
      // Page 패턴 제거
      .replace(/^(kr\s+|en\s+|KR\s+|EN\s+)?(Page\s+\d+|page\s+\d+)\s*/gi, '')
      .replace(/\s*(kr\s+|en\s+|KR\s+|EN\s+)?(Page\s+\d+|page\s+\d+)\s*$/gi, '')
      .replace(/^(kr\s+|en\s+|KR\s+|EN\s+)\s*/gi, '')
      // 반복 문자열 제거 (회사명/보고서명 반복으로 판정되는 경우)
      .replace(/(.{10,})\1{2,}/g, '$1') // 10자 이상 패턴이 3번 이상 반복되면 제거
      .trim()
    
    return cleaned
  }
  
  // 한글 문자 비율 계산 함수
  const getKoreanRatio = (text: string): number => {
    const koreanChars = text.match(/[가-힣]/g) || []
    return text.length > 0 ? koreanChars.length / text.length : 0
  }
  
  // 유사도 계산 함수 (간단한 Jaccard 유사도)
  const calculateSimilarity = (text1: string, text2: string): number => {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    const intersection = new Set([...words1].filter(w => words2.has(w)))
    const union = new Set([...words1, ...words2])
    return union.size > 0 ? intersection.size / union.size : 0
  }
  
  // PDF 근거 발췌 추출 (문단 단위) - pdf-evidence-extractor 사용
  let finalEvidence: Array<{
    source: "PDF" | "METADATA" | "INFERRED"
    excerpt?: string
    locationHint?: string
    topic?: string
    id?: string
    title?: string
    text?: string
    sourceInfo?: {
      page?: number
      section?: string
      heading?: string
    }
  }> = []
  
  // pageMap이 있으면 pdf-evidence-extractor 사용
  const pageMapRecord: Record<number, string> = pageMap instanceof Map
    ? Object.fromEntries(pageMap)
    : (pageMap || {})
  
  if (Object.keys(pageMapRecord).length > 0) {
    try {
      const pdfEvidence = extractPDFEvidence({
        pageMap: pageMapRecord,
        sectionMap,
        headingMap,
        companyName,
        businessPages: businessSectionPages,
      })
      
      // PDFEvidence를 IndustryClassification.evidence 형식으로 변환
      finalEvidence = pdfEvidence.map((ev) => {
        const locationHint = ev.sourceInfo.page
          ? ev.sourceInfo.section
            ? ev.sourceInfo.heading
              ? `p.${ev.sourceInfo.page} (${ev.sourceInfo.section} - ${ev.sourceInfo.heading})`
              : `p.${ev.sourceInfo.page} (${ev.sourceInfo.section})`
            : `p.${ev.sourceInfo.page}`
          : undefined
        
        return {
          source: 'PDF' as const,
          excerpt: `${ev.title} ${ev.excerpt}`,
          locationHint,
          topic: ev.topic,
          id: ev.id,
          title: ev.title,
          text: ev.text,
          sourceInfo: {
            page: ev.sourceInfo.page,
            section: ev.sourceInfo.section,
            heading: ev.sourceInfo.heading,
          },
        }
      })
      
      // evidence가 토픽별로 고르게 확보될수록 confidence 가산
      const topicCount = new Set(finalEvidence.map(e => e.topic)).size
      if (topicCount >= 3) {
        confidence = Math.min(1.0, confidence + 0.1)
      } else if (topicCount >= 2) {
        confidence = Math.min(1.0, confidence + 0.05)
      }
    } catch (error) {
      console.warn('[IndustryClassifier] PDF evidence extraction failed:', error)
      // 폴백: 기본 메시지
    }
  }
  
  // evidence가 없으면 기본 메시지
  if (finalEvidence.length === 0) {
    const matchedKeywordsList = topIndustry.matchedKeywords.slice(0, 3).map(k => k.keyword).join(', ')
    finalEvidence.push({
      source: 'PDF',
      excerpt: `[기타] PDF 텍스트에서 "${matchedKeywordsList}" 키워드가 발견되었습니다.`,
      topic: '기타',
      id: 'step01-excerpt-default',
      title: '[기타]',
      text: `PDF 텍스트에서 "${matchedKeywordsList}" 키워드가 발견되었습니다.`,
      sourceInfo: {},
    })
  }
  
  // Confidence가 0.5 미만이면 "산업 미확인"으로 처리
  if (confidence < 0.5) {
    return {
      label: '산업 미확인',
      confidence,
      evidence: finalEvidence,
    };
  }
  
  // 제조업 세부 카테고리 score 기반 Top-N 선택 (핵심/부수 분리)
  // 사업 섹션으로 제한된 텍스트에서만 카운트 (pdfText는 이미 사업 섹션으로 제한됨)
  let finalLabel = INDUSTRY_LABELS[topIndustry.industry]
  let coreCategories: string[] | undefined = undefined
  let adjacentCategories: string[] | undefined = undefined
  let reasonCode: string | undefined = undefined
  
  if (topIndustry.industry === 'manufacturing' && topIndustry.matchedKeywords.length > 0) {
    // 세부 카테고리별 score 계산 (사업 섹션 텍스트에서만)
    const categoryScores: Array<{ category: string; score: number; keywords: string[] }> = []
    
    // 반도체/메모리
    const semiconductorKeywords = ['반도체', '메모리', 'DRAM', 'NAND', 'HBM', '파운드리']
    const semiconductorScore = topIndustry.matchedKeywords
      .filter(k => semiconductorKeywords.includes(k.keyword))
      .reduce((sum, k) => {
        // 사업 섹션 내 출현이면 가중치 2배 (이미 matchedKeywords에 반영됨)
        return sum + k.score
      }, 0)
    if (semiconductorScore > 0) {
      categoryScores.push({
        category: '반도체/메모리',
        score: semiconductorScore,
        keywords: topIndustry.matchedKeywords.filter(k => semiconductorKeywords.includes(k.keyword)).map(k => k.keyword)
      })
    }
    
    // 모바일
    const mobileKeywords = ['스마트폰', '모바일']
    const mobileScore = topIndustry.matchedKeywords
      .filter(k => mobileKeywords.includes(k.keyword))
      .reduce((sum, k) => sum + k.score, 0)
    if (mobileScore > 0) {
      categoryScores.push({
        category: '모바일',
        score: mobileScore,
        keywords: topIndustry.matchedKeywords.filter(k => mobileKeywords.includes(k.keyword)).map(k => k.keyword)
      })
    }
    
    // 디스플레이
    const displayKeywords = ['디스플레이', 'OLED']
    const displayScore = topIndustry.matchedKeywords
      .filter(k => displayKeywords.includes(k.keyword))
      .reduce((sum, k) => sum + k.score, 0)
    if (displayScore > 0) {
      categoryScores.push({
        category: '디스플레이',
        score: displayScore,
        keywords: topIndustry.matchedKeywords.filter(k => displayKeywords.includes(k.keyword)).map(k => k.keyword)
      })
    }
    
    // 가전
    const applianceKeywords = ['가전', '전자제품', 'TV', '냉장고', '세탁기', '에어컨', '생활가전']
    const applianceScore = topIndustry.matchedKeywords
      .filter(k => applianceKeywords.includes(k.keyword))
      .reduce((sum, k) => sum + k.score, 0)
    if (applianceScore > 0) {
      categoryScores.push({
        category: '가전/전자제품',
        score: applianceScore,
        keywords: topIndustry.matchedKeywords.filter(k => applianceKeywords.includes(k.keyword)).map(k => k.keyword)
      })
    }
    
    // score 내림차순 정렬
    categoryScores.sort((a, b) => b.score - a.score)
    
    // 최소 임계치 확인
    const top1Score = categoryScores[0]?.score || 0
    const minThreshold = 1.0 // 최소 임계치
    let reasonCode: string | undefined = undefined
    
    if (top1Score < minThreshold) {
      // top1Score가 최소 임계치 미만이면: 상위 폴백
      // core는 "전자제품" 같은 상위 라벨로 폴백
      coreCategories = ['전자제품']
      adjacentCategories = []
      reasonCode = 'INDUSTRY_LOW_SIGNAL'
    } else {
      // core 선정: 항상 1개만 (가장 점수 높은 카테고리)
      coreCategories = categoryScores.length > 0
        ? [categoryScores[0].category]
        : []
      
      // adjacent 선정: 2~4위 중 점수 임계치 충족한 것만, 최대 3개
      const adjacentThreshold = 0.3 * top1Score
      adjacentCategories = categoryScores
        .slice(1, 5) // 2~4위 (인덱스 1~4)
        .filter(c => c.score >= adjacentThreshold)
        .slice(0, 3) // 최대 3개
        .map(c => c.category)
    }
    
    // 라벨 생성 (핵심만 표시)
    if (coreCategories && coreCategories.length > 0) {
      finalLabel = `제조업(${coreCategories[0]})`
    }
    
    // reasonCode를 반환값에 포함
    return {
      label: finalLabel,
      confidence,
      evidence: finalEvidence,
      coreCategories,
      adjacentCategories,
      reasonCode,
    };
  }
  
  return {
    label: finalLabel,
    confidence,
    evidence: finalEvidence,
    coreCategories,
    adjacentCategories,
    reasonCode,
  };
}

/**
 * 메타데이터에서 산업군 분류 (우선순위 1순위)
 * 
 * @param metadataIndustry 메타데이터의 산업군 (이미 분류된 경우)
 * @returns IndustryClassification 또는 null
 */
export function classifyIndustryFromMetadata(
  metadataIndustry: string | IndustryType | undefined
): IndustryClassification | null {
  if (!metadataIndustry || typeof metadataIndustry !== 'string') {
    return null;
  }
  
  // metadataIndustry가 유효한 IndustryType인지 확인
  const validIndustries: IndustryType[] = ['manufacturing', 'it', 'finance', 'bio', 'retail', 'energy', 'construction', 'service', 'other'];
  if (validIndustries.includes(metadataIndustry as IndustryType)) {
    return {
      label: INDUSTRY_LABELS[metadataIndustry as IndustryType],
      confidence: 1.0, // 메타데이터는 확실한 근거
      evidence: [{
        source: 'METADATA',
        excerpt: `회사 메타데이터에서 "${metadataIndustry}" 산업군으로 분류되었습니다.`,
      }],
    };
  }
  
  return null;
}
