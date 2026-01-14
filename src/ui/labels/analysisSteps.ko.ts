/**
 * 분석 단계 UI 문구 사전 (한국어)
 * 사용자 화면에 표시되는 모든 문구를 여기서 관리
 * 내부 용어(레벨2, 잠근다 등) 제거, 대중형 용어 사용
 */

/**
 * Step 1-11 제목
 */
export const STEP_TITLES: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11, string> = {
  1: '산업 및 경쟁환경',
  2: '비즈니스 모델과 해자',
  3: '실적과 기대',
  4: '수익성 및 ROIC',
  5: '현금흐름',
  6: '재무안정 및 부채',
  7: '자본배분',
  8: '가치평가(DCF/S-RIM/SOTP)',
  9: '리스크 및 포렌식',
  10: '시장 오버레이 및 촉매',
  11: '최종 판정',
}

/**
 * Step 1-11 설명
 */
export const STEP_DESCRIPTIONS: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11, string> = {
  1: '회사가 속한 산업의 특성과 경쟁 환경을 분석합니다.',
  2: '비즈니스 모델의 핵심과 경쟁 우위(해자)를 평가합니다.',
  3: '과거 실적과 미래 기대치를 비교 분석합니다.',
  4: '수익성 지표와 투하자본 수익률(ROIC)을 평가합니다.',
  5: '영업, 투자, 재무 활동으로 인한 현금 흐름을 분석합니다.',
  6: '재무 안정성과 부채 수준을 평가합니다.',
  7: '자본 배분 정책과 배당/자기주식 매입을 분석합니다.',
  8: 'DCF, S-RIM, SOTP 등 다양한 방법론으로 가치를 평가합니다.',
  9: '리스크 요인과 포렌식 회계 분석을 수행합니다.',
  10: '시장 상황과 주가 촉매 요인을 분석합니다.',
  11: '종합적인 투자 판정과 결론을 제시합니다.',
}

/**
 * 일반 UI 문구
 */
export const UI_TEXT = {
  // 버튼
  evidenceButton: '원문 보기',
  next: '다음',
  prev: '이전',
  back: '돌아가기',
  close: '닫기',
  download: '다운로드',
  viewOriginal: '원문 보기',
  addMoreFiles: '추가 파일 등록',
  
  // 상태 메시지
  loading: '분석 중...',
  analyzing: '분석 진행 중',
  completed: '분석 완료',
  error: '오류 발생',
  
  // 데이터 부족 메시지 (추정 금지 정책)
  insufficientData: '데이터 부족',
  insufficientDataDescription: '표시 가능한 기간이 부족해요. 직전 분기(또는 직전 연도) 보고서를 추가하면 흐름 차트를 볼 수 있어요.',
  dataInsufficientForCalculation: '데이터 부족으로 일부 항목은 계산하지 않았습니다.',
  noDataAvailable: '데이터를 사용할 수 없습니다.',
  
  // 분석 관련
  analysisPending: '분석 대기 중',
  analysisInProgress: '분석 진행 중',
  analysisComplete: '분석 완료',
  
  // 파일 관련
  fileUpload: '파일 업로드',
  fileParsing: '파일 파싱 중',
  fileParsed: '파일 파싱 완료',
  
  // 차트 관련
  chartNotAvailable: '차트를 표시할 수 없습니다.',
  chartDataInsufficient: '차트 데이터가 부족합니다.',
  
  // 근거 관련
  evidenceSource: '출처',
  evidencePage: '페이지',
  evidenceTag: '태그',
  evidenceContext: '컨텍스트',
  
  // 경고/알림
  warning: '주의',
  info: '안내',
  errorTitle: '오류',
  
  // 기타
  companyName: '회사명',
  fiscalYear: '회계연도',
  quarter: '분기',
  period: '기간',
}

/**
 * 카테고리별 문구
 */
export const CATEGORY_LABELS = {
  CashFlow: '현금흐름',
  EarningsQuality: '수익 품질',
  BalanceSheet: '재무상태표',
  Guidance: '경영진 가이던스',
  Risk: '리스크',
  Governance: '지배구조',
  Valuation: '가치평가',
  MarketOverlay: '시장 분석',
}

/**
 * 심각도별 문구
 */
export const SEVERITY_LABELS = {
  info: '정보',
  warn: '주의',
  risk: '위험',
}

/**
 * 체크포인트 관련 문구
 */
export const CHECKPOINT_LABELS = {
  whatToWatch: '주시할 항목',
  whyItMatters: '중요성',
  nextQuarterAction: '다음 분기 조치',
}

/**
 * Step1 전용 문구
 */
export const STEP1_TEXT = {
  // 섹션 타이틀
  findingsTitle: '핵심 관찰',
  industryCardTitle: '산업 분류',
  evidenceTitle: '분류 근거',
  characteristicsTitle: '산업 특성(참고)',
  additionalChecksTitle: '추가 확인',
  
  // 산업 분류 카드
  industryLabel: '산업군',
  industryCoreLabel: '핵심 사업군',
  industryAdjacentLabel: '연관 사업군',
  industryCorePrefix: '제조업',
  confidenceLabel: '분류 확신도',
  unconfirmed: '미확인',
  lowSignalNote: '참고: 사업 섹션에서 충분한 키워드를 찾지 못해 상위 분류로 표시합니다.',
  
  // 공시 발췌
  noEvidenceSnippet: '분류 근거 없음(추가 추출 필요)',
  topicLabel: '주제',
  viewDetails: '자세히 보기',
  close: '닫기',
  copy: '복사',
  source: '출처',
  
  // 산업 특성
  cyclicalSensitivity: '경기민감도',
  competitionIntensity: '경쟁강도',
  regulatoryIntensity: '규제강도',
  pricingPower: '가격결정력',
  evidenceStatusOk: '근거 있음',
  evidenceStatusWeak: '근거 제한',
  evidenceStatusNone: '판단 불가(근거 부족)',
  generalTraitNote: '업종 일반 특성(근거 제한)',
  characteristicsNote: '참고: 업종 일반 특성입니다. 회사별 공시 근거로 다음 단계에서 확인합니다.',
  
  // 레벨 표시 (Low/Med/High -> 낮음/보통/높음)
  levelLow: '낮음',
  levelMed: '보통',
  levelHigh: '높음',
  
  // 체크포인트 라벨 (CHECKPOINT_LABELS와 중복이지만 Step1 전용으로 명시)
  whatToWatch: '확인 내용',
  whyItMatters: '왜 중요한가',
  nextAction: '확인 방법',
  
  // Finding 템플릿 문구
  findingObservationLabel: '관찰',
  findingEvidenceLabel: '근거',
  findingImplicationLabel: '시사점',
  
  // 근거 placeholder (신규)
  findingEvidencePlaceholder: '근거 목록 참조',
  
  // 근거 부족 문구
  findingHoldPrefix: '판단 보류(근거 부족)',
  findingHoldEvidence: '데이터 부족',
  holdObservationSuffix: '평가를 위한 공시 근거 부족',
  holdImplicationDefault: '다음 단계에서 확인 필요',
  
  // Trait별 시사점 템플릿 (짧게, 50자 이내)
  implicationCyclical: '매크로(경기·금리) 변화에 따라 수요 변동 가능성이 높아 경기 민감도가 높을 가능성이 큼',
  implicationCompetition: '경쟁 강도가 높고 가격·점유율 압박 가능성이 있어 경쟁 강도가 높을 가능성이 큼',
  implicationPricingPower: '판가 방어 및 원가 전가 여부가 마진 핵심 변수로 가격결정력이 핵심 변수로 작용할 가능성이 큼',
  implicationRegulation: '규제 변화가 비용·판매 조건에 영향을 줄 가능성이 있어 규제 민감도가 높을 가능성이 큼',
}

/**
 * Step1 체크포인트 템플릿
 * 보류된 trait별로 생성되는 체크포인트의 표준 문구
 */
export const STEP1_CHECKPOINT_TEMPLATES = {
  // 코어카테고리별 템플릿
  '가전/전자제품': {
    cyclical: {
      whatToWatch: '수요(소비/주택/금리)',
      checkLocation: '사업의 내용 / 시장의 특성',
      confirmQuestion: '소비자 구매력 및 주택 시장 동향이 제품 수요에 미치는 영향은?',
    },
    competition: {
      whatToWatch: '채널/판촉',
      checkLocation: '주요 제품 및 서비스 / 경쟁현황',
      confirmQuestion: '채널별 판촉 비용 및 경쟁사 대비 가격 정책은?',
    },
    pricingPower: {
      whatToWatch: '원가/부품',
      checkLocation: '사업의 내용 / 주요 제품 및 서비스',
      confirmQuestion: '부품 원가 변동 및 공급망 안정성이 마진에 미치는 영향은?',
    },
    regulation: {
      whatToWatch: '규제/인증',
      checkLocation: '사업의 내용 / 경쟁현황',
      confirmQuestion: '환경 규제 및 제품 인증 요건 변화가 비용에 미치는 영향은?',
    },
  },
  '반도체/메모리': {
    cyclical: {
      whatToWatch: '사이클(DRAM/NAND)',
      checkLocation: '사업의 내용 / 시장의 특성',
      confirmQuestion: '메모리 가격 사이클 전환 시점 및 고객 수요 전망은?',
    },
    pricingPower: {
      whatToWatch: '고객/ASP',
      checkLocation: '주요 제품 및 서비스 / 경쟁현황',
      confirmQuestion: '주요 고객사별 ASP 협상력 및 계약 조건 변화는?',
    },
    regulation: {
      whatToWatch: 'CAPEX/가동률',
      checkLocation: '사업의 내용 / 주요 제품 및 서비스',
      confirmQuestion: '신규 라인 증설 계획 및 가동률 전망이 수익성에 미치는 영향은?',
    },
    competition: {
      whatToWatch: '경쟁/점유율',
      checkLocation: '경쟁현황 / 시장의 특성',
      confirmQuestion: '중국 업체 추격 및 시장 점유율 변화 전망은?',
    },
  },
  '디스플레이': {
    pricingPower: {
      whatToWatch: '패널가/가동률',
      checkLocation: '사업의 내용 / 주요 제품 및 서비스',
      confirmQuestion: '패널 가격 전망 및 공급 과잉/부족 상황은?',
    },
    cyclical: {
      whatToWatch: '고객사/세트 수요',
      checkLocation: '주요 제품 및 서비스 / 시장의 특성',
      confirmQuestion: '주요 고객사(세트업체)의 수요 전망 및 신규 모델 출시 일정은?',
    },
    competition: {
      whatToWatch: '중국 경쟁',
      checkLocation: '경쟁현황 / 시장의 특성',
      confirmQuestion: '중국 업체의 가격 경쟁 및 시장 점유율 변화는?',
    },
    regulation: {
      whatToWatch: '규제/인증',
      checkLocation: '사업의 내용 / 경쟁현황',
      confirmQuestion: '환경 규제 및 에너지 효율 인증 요건 변화가 비용에 미치는 영향은?',
    },
  },
  // 기본 템플릿 (core가 없거나 매칭되지 않을 때)
  default: {
    cyclical: {
      whatToWatch: '수요/경기 지표',
      checkLocation: '사업의 내용 / 시장의 특성',
      confirmQuestion: '경기 변동이 수요에 미치는 영향 및 주요 수요 지표는?',
    },
    competition: {
      whatToWatch: '경쟁/점유율',
      checkLocation: '경쟁현황 / 시장의 특성',
      confirmQuestion: '경쟁 강도 및 시장 점유율 변화 전망은?',
    },
    regulation: {
      whatToWatch: '규제/인증',
      checkLocation: '사업의 내용 / 경쟁현황',
      confirmQuestion: '규제 환경 변화가 비즈니스에 미치는 영향은?',
    },
    pricingPower: {
      whatToWatch: '가격/원가',
      checkLocation: '주요 제품 및 서비스 / 경쟁현황',
      confirmQuestion: '가격 결정력 및 원가 변동성이 마진에 미치는 영향은?',
    },
  },
} as const
