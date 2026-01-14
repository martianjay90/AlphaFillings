# 레벨2 동등성 계약 (Level 2 Equivalence Contract)

## 목적

웹 분석 결과와 레벨2 분석 결과의 완전한 동등성을 보장하기 위한 계약 정의.

## 동등성 정의

### 1. 숫자 무결성 (Numeric Integrity)

- **원본 데이터 보존**: XBRL/PDF에서 추출한 모든 숫자는 원본과 1원 단위까지 일치해야 함
- **스케일 변환 금지**: `decimals` 속성 기반 스케일 곱셈 절대 금지
  - `decimals`는 메타정보로만 보관
  - 값은 `parseFloat`로만 해석
- **0 값 채우기 금지**: 데이터가 없으면 `undefined`로 유지, 절대 0으로 채우지 않음
- **부호 일관성**: 
  - CAPEX는 항상 양수(절대값)로 저장
  - FCF = OCF - CAPEX(양수) 계산

### 2. 기간/단위/통화 라벨 (Period/Unit/Currency Labels)

- **PeriodKey 필수**: 모든 재무제표는 `PeriodKey`로 명확히 식별
  - `fiscalYear`: 회계연도 (2000-2100 범위)
  - `quarter`: 분기 (1-4 또는 undefined)
  - `periodType`: "FY" (연간) | "Q" (분기) | "YTD" (연간누계)
  - `endDate`: ISO 8601 형식 (YYYY-MM-DD)
- **MoneyMeta 필수**: 모든 금액 항목은 단위/통화 정보 포함
  - `currency`: "KRW" | "USD"
  - `unit`: "원" | "백만원" | "억원" | "USD" | "thousandUSD" | "millionUSD"
  - `signConvention`: "asReported" (보고서 그대로)
- **라벨 누락 금지**: 기간/단위/통화 정보가 없으면 분석 불가로 처리

### 3. Step1~11 산출물 구조 (Step Outputs Structure)

- **11단계 분석 프로세스**: 각 단계는 `StepOutput`으로 표현
  - Step 1: 손익계산서 분석
  - Step 2: 현금흐름표 분석
  - Step 3: 재무상태표 분석
  - Step 4: 수익성 지표
  - Step 5: 효율성 지표
  - Step 6: 안정성 지표
  - Step 7: 성장성 지표
  - Step 8: 현금흐름 품질
  - Step 9: 수익 품질
  - Step 10: 경영진 가이던스
  - Step 11: 리스크 체크포인트
- **각 StepOutput 구성**:
  - `step`: 1-11
  - `title`: 단계 제목
  - `summaryCards`: 핵심 지표 카드 배열
  - `findings`: 발견 사항 배열
  - `checkpoints`: 체크포인트 배열
  - `chartPlan`: 차트 계획 (선택)

### 4. 체크포인트/EWS (Checkpoints/Early Warning System)

- **Checkpoint 구조**:
  - `id`: 고유 식별자
  - `title`: 체크포인트 제목
  - `whatToWatch`: 주시할 항목
  - `whyItMatters`: 중요성 설명
  - `nextQuarterAction`: 다음 분기 조치 사항
  - `evidence`: 근거 참조 배열
- **EWS 통합**: 모든 체크포인트는 EvidenceRef를 통해 원본 데이터에 연결

### 5. 근거 클릭 추적 (Evidence Click Tracking)

- **EvidenceRef 필수**: 모든 주요 문장/판단은 EvidenceRef 배열 포함
- **EvidenceRef 구조**:
  - `sourceType`: "XBRL" | "PDF"
  - `fileId`: 파일 식별자
  - `locator`: 위치 정보
    - `page`: PDF 페이지 번호 (PDF인 경우)
    - `tag`: XBRL 태그명 (XBRL인 경우)
    - `contextRef`: XBRL contextRef (XBRL인 경우)
    - `lineHint`: 텍스트 라인 힌트
  - `quote`: 인용 텍스트 (선택)
- **근거 없는 요약 금지**: 근거가 없는 요약 문장은 생성하지 않음

## 금지사항 (Prohibitions)

### 1. Decimals 스케일 곱셈 금지
```typescript
// ❌ 금지
if (decimals < 0) {
  value = numericValue * Math.pow(10, Math.abs(decimals));
}

// ✅ 허용
value = parseFloat(textContent);
// decimals는 메타정보로만 보관
```

### 2. 기간 성격 혼합 연결선 금지
- 연간 데이터와 분기 데이터를 혼합하여 연결선 차트 생성 금지
- 같은 `periodType`끼리만 연결

### 3. 없는 값 0으로 채우기 금지
```typescript
// ❌ 금지
operatingIncome: extractValue(...) || 0

// ✅ 허용
operatingIncome: extractValue(...) || undefined
```

### 4. 근거 없는 요약 문장 금지
```typescript
// ❌ 금지
{
  text: "매출이 증가했습니다.",
  evidence: [] // 빈 배열
}

// ✅ 허용
{
  text: "매출이 증가했습니다.",
  evidence: [
    {
      sourceType: "XBRL",
      fileId: "file-1",
      locator: { tag: "ifrs-full:Revenue", contextRef: "CurrentYear" },
      quote: "매출액: 1,234,567,890원"
    }
  ]
}
```

## 검증 규칙 (Validation Rules)

1. **AnalysisBundle 검증**:
   - 모든 `FinancialStatement`는 `PeriodKey` 포함 필수
   - 모든 `FinancialItem`은 `MoneyMeta` 포함 필수
   - `value`가 `undefined`인 경우 `warnings`에 사유 기록
   - 모든 `Finding`과 `Checkpoint`는 `evidence` 배열 필수 (빈 배열 금지)

2. **파생 지표 검증**:
   - `derived` 배열은 `statements` 배열과 1:1 대응
   - 계산 불가능한 지표는 `undefined`로 유지
   - 계산 불가능한 경우 `warnings`에 사유 기록

3. **근거 추적 검증**:
   - 모든 `Finding.text`는 최소 1개의 `EvidenceRef` 포함
   - 모든 `Checkpoint`는 최소 1개의 `EvidenceRef` 포함
   - `summaryCards`의 `value`가 있는 경우 `evidence` 포함 권장

## 구현 체크리스트

- [x] AnalysisBundle 타입 정의
- [x] AnalysisBundleBuilder 구현
- [ ] 기존 파이프라인 통합
- [ ] EvidenceRef 자동 생성 로직
- [ ] 검증 함수 구현
- [ ] 단위 테스트 작성

## 참고

이 계약은 웹 분석 결과와 레벨2 분석 결과 간의 완전한 호환성을 보장하기 위한 것입니다. 
모든 변경사항은 이 계약을 준수해야 하며, 위반 시 분석 결과의 신뢰성이 저하될 수 있습니다.
