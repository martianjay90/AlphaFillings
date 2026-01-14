# Sync Value AI

AI 기반 기업 가치 평가 플랫폼

## 기술 스택

- **Next.js 15**: App Router 기반 웹 프레임워크
- **TypeScript**: 엄격한 타입 시스템
- **Tailwind CSS**: 유틸리티 기반 스타일링
- **Shadcn UI**: 컴포넌트 라이브러리
- **Supabase**: 백엔드 서비스

## 프로젝트 구조

```
/src
  /app              # 웹 페이지 화면 (Next.js App Router)
    - layout.tsx    # 루트 레이아웃 (다크 테마 적용)
    - page.tsx      # 메인 페이지 (제어판 포함)
    - globals.css   # 전역 스타일 (Tailwind + 다크 테마)
  /components       # UI 요소
    - control-panel.tsx  # 분석 제어판 컴포넌트
    - search-bar.tsx # 중앙 검색바
    - report-viewer.tsx # Split-View 리포트 뷰어
    - source-viewer.tsx # Glassmorphism 소스 뷰어
    - briefing-panel.tsx # 브리핑 패널
    /ui              # Shadcn UI 컴포넌트
  /lib
    /agents         # 에이전트 로직
      - investigator.ts # The Investigator (XBRL-PDF 크로스 검증, MD&A 분석)
      - librarian.ts   # The Librarian (Split-View, Smart-Link 관리)
    /valuation      # 가치평가 계산 엔진
      - engine.ts   # ROIC, S-RIM, 유지보수 CAPEX 계산
      - forensic.ts # 포렌식 회계 필터 (이익의 질, 운전자본 트랩)
      - advanced.ts # WACC, 3단계 할인율, FCF 범위
      - briefing.ts # 논리적 브리핑 시스템
      - hallucination-prevention.ts # 환각 방지 시스템
    /parsers        # DART(KR) 및 SEC(US) 전용 XBRL/PDF 데이터 추출기
      - interfaces.ts # 파서 인터페이스 정의
      - validation.ts # 재무제표 검증 (자산 = 부채 + 자본)
      - dart.ts      # DART 파서 구현
      - sec.ts       # SEC 파서 구현
      - unified.ts   # 통합 파서
      - data-integrity.ts # 데이터 무결성 검증
      - notes-parser.ts # 주석 파싱 고도화 (독성 항목 탐지)
    /supabase       # Supabase 클라이언트 설정
    /utils          # 유틸리티 함수
      - currency.ts # 통화 단위 및 회계 기준 처리
      - errors.ts   # 에러 처리 및 안전장치
      - cn.ts       # Tailwind 클래스 병합
  /types            # TypeScript 타입 정의
    - industry.ts   # 산업별 가중치 인터페이스
    - analysis.ts   # 분석 입력/결과 타입
    - financial.ts  # 재무제표 데이터 타입 정의
```

## 주요 기능

### ✅ 완료된 기능

1. **브랜드 및 디자인**
   - **Sync Value AI** 브랜드 통합
   - 딥 블랙 테마 (#000000) + Electric Blue 포인트 컬러
   - Inter 폰트 적용 (Apple/Google 수준의 가독성)
   - Glass morphism 효과 (Blur, Card 레이아웃)

2. **메인 UI (Simple Different)**
   - 구글 스타일 중앙 대형 검색바
   - Auto-Fill 기능 (초보자용 자동 입력)
   - 광고 슬롯 우아한 배치 (우측 사이드바)

3. **타입 시스템**
   - 산업별 가중치 인터페이스 정의 (`src/types/industry.ts`)
   - 한국(KRW/IFRS)과 미국(USD/GAAP) 분리 처리
   - 엄격한 TypeScript 타입 적용

4. **안전장치**
   - 데이터 불충분 시 '분석 불가' 상태 반환
   - 에러 로깅 시스템
   - 안전한 분석 실행 래퍼
   - DART/SEC 원천 데이터 확인 시에만 분석 실행

5. **가치평가 엔진** (`src/lib/valuation/engine.ts`)
   - **ROIC 계산**: NOPAT / Invested Capital (IC = 영업자산 - 비이자발생부채)
   - **유지보수 CAPEX 범위**: D&A × 0.7 ~ D&A × 0.9
   - **S-RIM 모델**: 자기자본과 초과이익으로 하방 가격 산출
   - **산업별 가중치 적용**: 각 지표의 최종 점수에 가중치 합산
   - 모든 계산 결과에 재무제표 항목명 포함

6. **고도화 분석 로직** (`src/lib/valuation/advanced.ts`)
   - **WACC 계산**: 가중평균자본비용 (자기자본 비중, 부채 비중 고려)
   - **3단계 할인율 모델**: 고성장기/안정 성장기/성숙기 단계별 할인율
   - **FCF 범위 계산**: 유지보수 CAPEX 범위 기반 FCF 상단/하단 자동 산출

7. **포렌식 회계 필터** (`src/lib/valuation/forensic.ts`)
   - **이익의 질 체크**: EPS 성장률 vs OCF 성장률 (괴리율 20% 이상 경고)
   - **운전자본 트랩**: 매출 증가율 vs 매출채권/재고 증가율 (매출 조작 의심 플래그)
   - **자본배분 점수**: CAPEX 대비 FCF 창출 능력 점수화 (0-100점)

8. **논리적 브리핑 시스템** (`src/lib/valuation/briefing.ts`)
   - **"왜?" 질문에 답하는 텍스트 브리핑 자동 생성**
   - ROIC, FCF, 이익의 질, 운전자본, 자본배분 등 종합 분석
   - 경고 및 우선순위 기반 섹션 구성
   - 예: "이 기업의 ROIC가 산업 평균 대비 높지만, 최근 CAPEX 대비 현금 전환이 늦어지고 있어 주의가 필요합니다."

9. **The Investigator 에이전트** (`src/lib/agents/investigator.ts`)
   - **XBRL-PDF 크로스 검증**: XBRL 수치와 PDF 주석 자동 매핑
   - **MD&A 질적 분석**: 구체적 숫자 vs 추상적 형용사 비중 분석
   - 경영진 언어 주의 플래그 (구체적 숫자 비중 감소, 추상적 형용사 증가 시)

10. **The Librarian 에이전트** (`src/lib/agents/librarian.ts`)
    - **Split-View**: 왼쪽 분석 리포트, 오른쪽 원천 데이터 뷰어
    - **Smart-Link**: 리포트 문장 클릭 시 PDF 해당 페이지로 자동 점프
    - 인터랙티브 소스 뷰어 관리

11. **주석 파싱 고도화** (`src/lib/parsers/notes-parser.ts`)
    - **독성 항목 우선 탐지**: 특수관계자 거래, 회계정책 변경, 감가상각 내용연수 변경 등
    - 공매도 세력이 주목하는 위험 요소 자동 탐지
    - 중요도 기반 정렬 (high, medium, low)

12. **환각 방지 시스템** (`src/lib/valuation/hallucination-prevention.ts`)
    - **원문 근거 검증**: AI 분석 내용의 원문 근거 자동 확인
    - 근거 없는 내용 자동 제외
    - "원본 데이터 확인 필요" 메시지 표시
    - 검증률 추적 및 리포트

7. **데이터 파서** (`src/lib/parsers/`)
   - **DART 파서**: 한국 공시 데이터 수집 인터페이스
   - **SEC 파서**: 미국 SEC EDGAR 데이터 수집 인터페이스
   - **XBRL 처리**: 재무제표 데이터 파싱 준비
   - **재무제표 검증**: 자산 = 부채 + 자본 등식 검증
   - **통합 파서**: 국가에 따라 자동으로 적절한 파서 선택

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.local` 파일을 생성하고 필요한 설정을 추가하세요:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# DART API (한국 공시 데이터)
NEXT_PUBLIC_DART_API_KEY=your_dart_api_key
# 또는
DART_API_KEY=your_dart_api_key

# SEC User-Agent (미국 공시 데이터)
SEC_USER_AGENT=Financial Analysis Platform (your-email@example.com)
```

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

## 산업별 가중치

현재 지원하는 산업군:
- 제조업
- IT/소프트웨어
- 금융
- 바이오/제약
- 유통/소매
- 에너지
- 건설
- 서비스업
- 기타

각 산업군별로 DCF, S-RIM, PBR, PER, EV/EBITDA 가중치가 정의되어 있습니다.

## 핵심 기능 상세

### 가치평가 엔진

#### ROIC (Return on Invested Capital)
- **공식**: ROIC = NOPAT / Invested Capital
- **NOPAT**: 영업이익 × (1 - 세율)
- **Invested Capital**: 영업자산 - 비이자발생부채
- 모든 계산 결과에 재무제표 항목명 포함

#### 유지보수 CAPEX 범위
- **최소값**: 감가상각비(D&A) × 0.7
- **최대값**: 감가상각비(D&A) × 0.9
- 단일값이 아닌 범위로 분석하여 더 정확한 평가

#### S-RIM 모델
- 자기자본과 초과이익을 활용한 하방 가격(Floor Price) 산출
- 초과이익 = (ROIC - 요구수익률) × 투하자본
- 하방 가격 = 자기자본 + (초과이익 / 요구수익률)

### 포렌식 회계 필터

#### 이익의 질 체크
- EPS 성장률과 OCF(영업현금흐름) 성장률 비교
- 괴리율 20% 이상 시 경고 메시지 출력
- 이익의 질 저하 의심 시 플래그 생성

#### 운전자본 트랩
- 매출 증가율 대비 매출채권/재고 증가율 분석
- 매출채권이나 재고가 매출보다 빠르게 증가하면 매출 조작 의심
- 자동으로 의심 플래그 및 사유 생성

#### 자본배분 점수
- CAPEX 대비 FCF 창출 능력을 0-100점으로 점수화
- FCF/CAPEX 비율 기반 평가
- excellent/good/fair/poor 등급 제공

### 데이터 검증 및 무결성

#### 재무제표 검증
- **기본 등식**: 자산 = 부채 + 자본
- 허용 오차 0.01% 내에서 검증
- 불일치 시 상세한 오류 메시지 제공
- 모든 검증 결과에 재무제표 항목명 포함

#### 데이터 무결성 검증 (`src/lib/parsers/data-integrity.ts`)
- **DART/SEC 원천 데이터 확인 시에만 분석 실행**
- 데이터 불확실 시 '분석 보류' 메시지 출력
- 재무제표 필수 항목 존재 여부 확인
- 손익계산서, 재무상태표, 현금흐름표 전체 검증

### 안전장치

- **NaN 체크**: 모든 계산 과정에서 NaN 발생 시 즉시 CalculationError 발생
- **데이터 누락**: 필수 데이터 누락 시 InsufficientDataError 발생
- **땜빵 금지**: 데이터가 없으면 에러를 발생시키고, 기본값으로 대체하지 않음
- **출처 추적**: 모든 계산 결과에 재무제표 항목명 포함하여 신뢰성 확보

## 디자인 시스템

### 브랜드
- **서비스명**: Sync Value AI
- **로고**: 미니멀한 타이포그래피
- **폰트**: Inter (Google Fonts)

### 컬러 팔레트
- **배경**: 딥 블랙 (#000000)
- **포인트 컬러**: Electric Blue (#00BFFF)
- **텍스트**: 화이트 및 부드러운 그레이
- **카드**: 약간 밝은 블랙 + Blur 효과

### UI 패턴
- **Glass Morphism**: backdrop-blur 효과
- **Card 레이아웃**: Apple 스타일의 둥근 모서리 카드
- **Minimal Design**: 불필요한 요소 제거, 집중도 향상
- **Split-View**: 리포트와 원천 데이터 동시 표시
- **Smart-Link**: 클릭 가능한 문장으로 원문 바로가기
- **애니메이션**: 부드러운 사이드바 열기/닫기 효과

## 다음 단계

- [x] 브랜드 통합 (Sync Value AI)
- [x] 메인 UI 개편 (중앙 검색바)
- [x] Auto-Fill 기능 구현
- [x] 고도화 분석 로직 (WACC, 3단계 할인율, FCF 범위)
- [x] 논리적 브리핑 시스템 구현
- [x] 데이터 무결성 검증 강화
- [x] DART API 연동 (공시대상회사 리스트, XBRL 다운로드, PDF URL 추출)
- [x] XBRL 파서 구현 (재무상태표, 손익계산서, 현금흐름표)
- [x] 회사 고유번호 레지스트리 (기업명/종목코드로 corp_code 자동 해석)
- [x] 주 1회 자동 업데이트 로직
- [ ] SEC API 연동
- [ ] 에이전트 로직 구현
- [ ] 리포트 대시보드 구현

## 회사 고유번호 레지스트리

### 기능
- **자동 다운로드**: DART API에서 공시대상회사 전체 리스트 자동 다운로드
- **캐싱**: Supabase 또는 로컬 스토리지에 저장하여 빠른 검색
- **자동 해석**: 기업명 또는 종목코드 입력 시 자동으로 `corp_code` 해석
- **자동 업데이트**: 주 1회 자동 업데이트 (7일마다)

### 사용 방법
```typescript
import { resolveCorpCode } from '@/lib/parsers/corp-code-resolver';

// 기업명 또는 종목코드로 회사 고유번호 해석
const result = await resolveCorpCode('삼성전자');
// 또는
const result = await resolveCorpCode('005930');

if (result.success) {
  console.log('회사 고유번호:', result.corp_code);
}
```

### Supabase 설정 (선택사항)
Supabase를 사용하지 않아도 로컬 스토리지에 자동으로 캐싱됩니다.

Supabase를 사용하려면:
1. `src/lib/supabase/schema.sql`의 스키마를 Supabase에 적용
2. 환경 변수에 Supabase URL과 키 설정

### API 엔드포인트
- `GET /api/update-company-list`: 회사 리스트 업데이트 체크 및 실행
- `POST /api/update-company-list`: 강제 업데이트 실행
