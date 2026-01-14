/**
 * 주석 파싱 고도화
 * 공매도 세력이 주목하는 독성 항목 우선 탐지
 */

/**
 * 독성 항목 타입
 */
export type ToxicItemType = 
  | 'related_party_transaction'  // 특수관계자 거래
  | 'accounting_policy_change'    // 회계정책 변경
  | 'depreciation_change'         // 감가상각 내용연수 변경
  | 'revenue_recognition_change' // 수익인식 정책 변경
  | 'contingent_liability'        // 우발부채
  | 'going_concern'               // 계속기업 가정
  | 'subsequent_event';           // 후속사건

/**
 * 독성 항목 키워드 매핑
 */
const TOXIC_ITEM_KEYWORDS: Record<ToxicItemType, string[]> = {
  related_party_transaction: [
    '특수관계자', '관련자', '특수관계자 거래', '관련자 거래',
    'related party', 'related-party transaction', 'affiliate transaction'
  ],
  accounting_policy_change: [
    '회계정책 변경', '회계처리 방법 변경', '회계기준 변경',
    'accounting policy change', 'change in accounting policy', 'accounting method change'
  ],
  depreciation_change: [
    '감가상각 내용연수 변경', '내용연수 변경', '감가상각 방법 변경',
    'depreciation period change', 'useful life change', 'depreciation method change'
  ],
  revenue_recognition_change: [
    '수익인식 정책 변경', '수익인식 시점 변경',
    'revenue recognition change', 'revenue recognition policy change'
  ],
  contingent_liability: [
    '우발부채', '우발사항', '보증부채',
    'contingent liability', 'contingency', 'guarantee'
  ],
  going_concern: [
    '계속기업 가정', '영속성 가정', '계속경영 가정',
    'going concern', 'going concern assumption'
  ],
  subsequent_event: [
    '후속사건', '기말일 후 사건',
    'subsequent event', 'post-balance sheet event'
  ],
};

/**
 * 독성 항목 탐지 결과
 */
export interface ToxicItemDetection {
  /** 항목 타입 */
  type: ToxicItemType;
  
  /** 탐지된 키워드 */
  keywords: string[];
  
  /** 관련 텍스트 일부 */
  excerpt: string;
  
  /** 페이지 번호 (PDF의 경우) */
  pageNumber?: number;
  
  /** 섹션 제목 */
  sectionTitle?: string;
  
  /** 중요도 (high, medium, low) */
  priority: 'high' | 'medium' | 'low';
  
  /** 요약 설명 */
  summary: string;
}

/**
 * 주석에서 독성 항목 탐지
 */
export function detectToxicItems(
  notesText: string,
  pageMap?: Map<number, string>
): ToxicItemDetection[] {
  const detections: ToxicItemDetection[] = [];
  
  for (const [type, keywords] of Object.entries(TOXIC_ITEM_KEYWORDS)) {
    const foundKeywords: string[] = [];
    let bestExcerpt = '';
    let bestPageNumber: number | undefined;
    let bestSectionTitle: string | undefined;
    
    for (const keyword of keywords) {
      const regex = new RegExp(keyword, 'gi');
      const matches = notesText.match(regex);
      
      if (matches && matches.length > 0) {
        foundKeywords.push(...matches);
        
        // 키워드 주변 텍스트 추출
        const index = notesText.toLowerCase().indexOf(keyword.toLowerCase());
        if (index !== -1) {
          const start = Math.max(0, index - 200);
          const end = Math.min(notesText.length, index + keyword.length + 200);
          const excerpt = notesText.substring(start, end);
          
          if (excerpt.length > bestExcerpt.length || !bestExcerpt) {
            bestExcerpt = excerpt.trim();
            
            // 페이지 번호 찾기
            if (pageMap) {
              for (const [page, text] of pageMap.entries()) {
                if (text.includes(keyword)) {
                  bestPageNumber = page;
                  break;
                }
              }
            }
            
            // 섹션 제목 추출
            bestSectionTitle = extractSectionTitle(bestExcerpt);
          }
        }
      }
    }
    
    if (foundKeywords.length > 0) {
      // 중요도 결정
      const priority: 'high' | 'medium' | 'low' = 
        type === 'going_concern' || type === 'accounting_policy_change' ? 'high' :
        type === 'depreciation_change' || type === 'revenue_recognition_change' ? 'medium' :
        'low';
      
      // 요약 생성
      const summary = generateToxicItemSummary(type as ToxicItemType, foundKeywords);
      
      detections.push({
        type: type as ToxicItemType,
        keywords: [...new Set(foundKeywords)],
        excerpt: bestExcerpt,
        pageNumber: bestPageNumber,
        sectionTitle: bestSectionTitle,
        priority,
        summary
      });
    }
  }
  
  // 중요도 순으로 정렬
  return detections.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
}

/**
 * 섹션 제목 추출
 */
function extractSectionTitle(text: string): string | undefined {
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
 * 독성 항목 요약 생성
 */
function generateToxicItemSummary(
  type: ToxicItemType,
  keywords: string[]
): string {
  const summaries: Record<ToxicItemType, string> = {
    related_party_transaction: '특수관계자 거래가 발견되었습니다. 거래 조건의 공정성을 확인해야 합니다.',
    accounting_policy_change: '회계정책 변경이 감지되었습니다. 변경 사유 및 영향도를 검토해야 합니다.',
    depreciation_change: '감가상각 내용연수 또는 방법 변경이 확인되었습니다. 이익 조작 가능성을 검토해야 합니다.',
    revenue_recognition_change: '수익인식 정책 변경이 발견되었습니다. 수익의 질을 재검토해야 합니다.',
    contingent_liability: '우발부채가 존재합니다. 잠재적 부채 규모를 평가해야 합니다.',
    going_concern: '계속기업 가정에 대한 언급이 있습니다. 기업의 지속가능성을 면밀히 검토해야 합니다.',
    subsequent_event: '기말일 후 사건이 보고되었습니다. 재무제표에 미치는 영향을 확인해야 합니다.',
  };
  
  return summaries[type] || '주요 사항이 발견되었습니다.';
}

/**
 * 독성 항목 요약 리포트 생성
 */
export function generateToxicItemsReport(
  detections: ToxicItemDetection[]
): {
  summary: string;
  highPriorityItems: ToxicItemDetection[];
  mediumPriorityItems: ToxicItemDetection[];
  lowPriorityItems: ToxicItemDetection[];
} {
  const highPriorityItems = detections.filter(d => d.priority === 'high');
  const mediumPriorityItems = detections.filter(d => d.priority === 'medium');
  const lowPriorityItems = detections.filter(d => d.priority === 'low');
  
  let summary = '';
  if (highPriorityItems.length > 0) {
    summary += `고위험 항목 ${highPriorityItems.length}개가 발견되었습니다. `;
  }
  if (mediumPriorityItems.length > 0) {
    summary += `중위험 항목 ${mediumPriorityItems.length}개, `;
  }
  if (lowPriorityItems.length > 0) {
    summary += `저위험 항목 ${lowPriorityItems.length}개가 확인되었습니다.`;
  }
  
  if (summary === '') {
    summary = '독성 항목이 발견되지 않았습니다.';
  }
  
  return {
    summary,
    highPriorityItems,
    mediumPriorityItems,
    lowPriorityItems
  };
}
