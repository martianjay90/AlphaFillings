/**
 * 분석 결과 번들 타입 정의
 * 레벨2 동등성 계약을 준수하는 단일 결과 모델
 */

/**
 * 기간 키 (Period Key)
 * 재무제표의 기간을 명확히 식별
 * 
 * 손익/현금흐름(기간형): periodType은 FY/YTD/Q 중 하나, startDate/endDate 함께 저장
 * 재무상태표(시점형): periodType은 "FY" (instant 시점을 표현), endDate만 저장 (startDate 없음)
 */
export interface PeriodKey {
  /** 회계연도 (2000-2100) */
  fiscalYear?: number;
  
  /** 분기 (1-4) */
  quarter?: 1 | 2 | 3 | 4;
  
  /** 기간 유형 
   * - FY: 연간 (Full Year) 또는 재무상태표의 instant 시점
   * - YTD: 누적 (Year-To-Date, 예: 9M(YTD))
   * - Q: 분기 (Quarter, 예: Q3(3M))
   */
  periodType: "FY" | "Q" | "YTD";
  
  /** 시작일 (ISO 8601: YYYY-MM-DD, 기간형에만 사용, 예: 2025-01-01) */
  startDate?: string;
  
  /** 종료일 (ISO 8601: YYYY-MM-DD, 모든 타입에서 사용) */
  endDate?: string;
}

/**
 * 금액 메타데이터 (Money Metadata)
 * 금액의 단위/통화 정보
 */
export interface MoneyMeta {
  /** 통화 */
  currency: "KRW" | "USD";
  
  /** 단위 */
  unit: "원" | "백만원" | "억원" | "USD" | "thousandUSD" | "millionUSD";
  
  /** 부호 규칙 */
  signConvention: "asReported";
}

/**
 * 근거 참조 (Evidence Reference)
 * 모든 주요 문장/판단의 근거를 추적
 */
export interface EvidenceRef {
  /** 소스 타입 */
  sourceType: "XBRL" | "PDF";
  
  /** 파일 식별자 */
  fileId: string;
  
  /** 위치 정보 */
  locator: {
    /** PDF 페이지 번호 (PDF인 경우) */
    page?: number;
    
    /** XBRL 태그명 (XBRL인 경우) */
    tag?: string;
    
    /** XBRL contextRef (XBRL인 경우) */
    contextRef?: string;
    
    /** 텍스트 라인 힌트 */
    lineHint?: string;
    
    /** 섹션명 (PDF인 경우, 예: "사업의 내용") */
    section?: string;
    
    /** 헤딩명 (PDF인 경우, 예: "주요 제품") */
    heading?: string;
  };
  
  /** 인용 텍스트 (선택) */
  quote?: string;
}

/**
 * 재무 항목 (Bundle Financial Item)
 * 값이 없으면 undefined로 유지 (0 금지)
 * 레벨2 동등성 계약 준수
 */
export interface BundleFinancialItem {
  /** 항목명 */
  name: string;
  
  /** 값 (없으면 undefined) */
  value?: number;
  
  /** 메타데이터 */
  meta: MoneyMeta;
  
  /** 근거 참조 배열 */
  evidence?: EvidenceRef[];
}

/**
 * 재무제표 (Bundle Financial Statement)
 * 레벨2 동등성 계약 준수
 */
export interface BundleFinancialStatement {
  /** 기간 키 */
  period: PeriodKey;
  
  /** 손익계산서 항목 (key-value 쌍) */
  income: Record<string, BundleFinancialItem>;
  
  /** 현금흐름표 항목 (key-value 쌍) */
  cashflow: Record<string, BundleFinancialItem>;
  
  /** 재무상태표 항목 (key-value 쌍) */
  balance: Record<string, BundleFinancialItem>;
}

/**
 * 파생 지표 (Derived Metrics)
 * 계산 불가능하면 undefined 유지
 */
export interface DerivedMetrics {
  /** 매출 */
  revenue?: number;
  
  /** 영업이익 */
  operatingIncome?: number;
  
  /** 영업현금흐름 */
  ocf?: number;
  
  /** 자본적지출 (항상 양수) */
  capex?: number;
  
  /** 잉여현금흐름 */
  fcf?: number;
  
  /** 영업이익률 (%) */
  opm?: number;
  
  /** FCF 마진 (%) */
  fcfMargin?: number;
  
  /** 투하자본수익률 (%) */
  roic?: number;
  
  /** 투하자본 (간이 계산: Equity + InterestBearingDebt - Cash) */
  investedCapital?: number;
  
  /** 참고 사항 */
  notes?: string[];
  
  /** 근거 참조 */
  evidence?: EvidenceRef[];
}

/**
 * 발견 사항 (Finding)
 * 모든 Finding은 evidence 필수
 */
export interface Finding {
  /** 고유 식별자 */
  id: string;
  
  /** 카테고리 */
  category: "CashFlow" | "EarningsQuality" | "BalanceSheet" | "Guidance" | "Risk" | "Governance" | "Valuation" | "MarketOverlay";
  
  /** 심각도 */
  severity: "info" | "warn" | "risk";
  
  /** 텍스트 (근거 없는 요약 금지) */
  text: string;
  
  /** 근거 참조 배열 (필수, 빈 배열 금지) */
  evidence: EvidenceRef[];
  
  /** 내부용 reasonCode (근거 부족 등) */
  reasonCode?: string;
}

/**
 * 체크포인트 (Checkpoint)
 * EWS 통합
 */
export interface Checkpoint {
  /** 고유 식별자 */
  id: string;
  
  /** 제목 */
  title: string;
  
  /** 주시할 항목 */
  whatToWatch: string;
  
  /** 중요성 설명 */
  whyItMatters: string;
  
  /** 다음 분기 조치 사항 */
  nextQuarterAction: string;
  
  /** 근거 참조 배열 (필수) */
  evidence: EvidenceRef[];
  
  /** 확인 질문 (다음에 확인할 자료/질문) */
  confirmQuestion?: string;
}

/**
 * 차트 타입
 */
export type ChartType = 
  | 'line'           // 추세선 (동일 기준 2개 이상)
  | 'bar'            // 막대 (단일 스냅샷 또는 YoY 비교)
  | 'waterfall'      // 폭포수 (현금흐름 구조)
  | 'gauge'          // 게이지 (마진 지표)
  | 'snapshot'       // 스냅샷 (단일 기간)

/**
 * 차트 계획 항목
 */
export interface ChartPlanItem {
  /** 차트 ID */
  chartId: string;
  
  /** 차트 타입 */
  chartType: ChartType;
  
  /** 기간 라벨 */
  periodLabel: string;
  
  /** 데이터 키 목록 (예: ['revenue', 'operatingIncome']) */
  dataKeys: string[];
  
  /** 가능 여부 */
  available: boolean;
  
  /** 불가능한 경우 이유 */
  reason?: string;
  
  /** 추가로 필요한 보고서 조건 */
  requiredReports?: string;
  
  /** 배지 (예: "분기 분해 불가") */
  badge?: string;
}

/**
 * 차트 계획
 */
export interface ChartPlan {
  /** Step 번호 */
  step: number;
  
  /** 가능한 차트 목록 */
  charts: ChartPlanItem[];
}

/**
 * 단계 출력 (Step Output)
 * Step 1-11 산출물
 */
export interface StepOutput {
  /** 단계 번호 (1-11) */
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
  
  /** 제목 */
  title: string;
  
  /** 요약 카드 배열 */
  summaryCards: Array<{
    label: string;
    value?: string;
    note?: string;
    evidence?: EvidenceRef[];
  }>;
  
  /** 발견 사항 배열 */
  findings: Finding[];
  
  /** 체크포인트 배열 */
  checkpoints: Checkpoint[];
  
  /** 차트 계획 */
  chartPlan?: ChartPlan;
}

/**
 * 산업군 분류 정보 (근거/확신도 기반)
 */
export interface IndustryClassification {
  /** 산업군 라벨 */
  label: string;
  
  /** 확신도 (0.0 ~ 1.0) */
  confidence: number;
  
  /** 근거 (소스 및 발췌문) */
  evidence?: Array<{
    source: "PDF" | "METADATA" | "INFERRED";
    excerpt?: string;
    locationHint?: string; // 위치 힌트 (예: "p.12" 또는 "사업의 내용 섹션")
    topic?: string; // 주제 라벨 (예: "사업/제품", "시장/수요", "경쟁", "가격/원가", "리스크/규제", "생산/공급망", "기타")
    // 표준화된 발췌 정보 (UI 개선용)
    id?: string; // 발췌 고유 ID
    title?: string; // 발췌 제목 (예: "[시장/수요]", "[경쟁]")
    text?: string; // 원문 전체 텍스트
    sourceInfo?: {
      page?: number; // 페이지 번호
      section?: string; // 섹션명 (예: "사업의 내용")
      heading?: string; // 헤딩명 (예: "주요 제품")
    };
  }>;
  
  /** 핵심 사업 카테고리 (제조업인 경우, 항상 1개) */
  coreCategories?: string[];
  
  /** 연관 사업 카테고리 (제조업인 경우, 최대 3개) */
  adjacentCategories?: string[];
  
  /** 분류 실패 이유 코드 (선택) */
  reasonCode?: string;
}

/**
 * 데이터 품질 정보
 */
export interface DataQuality {
  /** 누락된 개념/항목 목록 (예: ["Cash", "InterestBearingDebt"]) */
  missingConcepts?: string[];
  
  /** 계산 불가능한 지표 목록 (예: ["ROIC", "InvestedCapital"]) */
  blockedMetrics?: string[];
}

/**
 * 계산 정책 (Calculation Policy)
 * 재현성을 위한 계산 정의/정책 메타데이터
 */
export interface CalculationPolicy {
  /** CAPEX 정책 */
  capexPolicy: "PPE_ONLY" | "PPE_PLUS_INTANGIBLE";
  
  /** EPS 스코프 */
  epsScope: "CONTINUING" | "TOTAL";
  
  /** ROE 정의 */
  roeDefinition: "CUMULATIVE_END_EQUITY";
  
  /** FCF 정의 */
  fcfDefinition: "OCF_MINUS_CAPEX";
  
  /** CAPEX 구성 요소 포함 여부 */
  capexComponentsIncluded: {
    ppe: boolean;
    intangible: boolean;
  };
}

/**
 * 분석 번들 (Analysis Bundle)
 * 웹 분석 결과의 단일 모델
 */
export interface AnalysisBundle {
  /** 실행 ID */
  runId: string;
  
  /** 회사 정보 */
  company: {
    name: string;
    ticker?: string;
    market?: "KR" | "US";
    /** 산업군 분류 (근거/확신도 기반) */
    industry?: IndustryClassification;
  };
  
  /** 대표 기간 (최신 endDate 기준, 단일 진실 소스) */
  period: PeriodKey;
  
  /** 기간 라벨 (예: "9M(YTD)", "Q3(3M)", "FY") */
  periodLabel?: string;
  
  /** 재무제표 배열 (시계열 순, endDate 기준 내림차순 정렬) */
  statements: BundleFinancialStatement[];
  
  /** 파생 지표 배열 (statements와 1:1 대응) */
  derived: DerivedMetrics[];
  
  /** 단계 출력 배열 (Step 1-11) */
  stepOutputs: StepOutput[];
  
  /** 모든 근거 참조 (중복 제거) */
  allEvidence: EvidenceRef[];
  
  /** 경고 메시지 배열 */
  warnings: string[];
  
  /** 데이터 품질 정보 */
  dataQuality?: DataQuality;
  
  /** 계산 정책 (재현성 강화) */
  meta?: {
    calculationPolicy: CalculationPolicy;
  };
}
