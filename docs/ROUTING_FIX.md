# 라우팅 구조 고정 및 CSS 연결 안정화

## 문제
- 메인 화면이 기본 HTML처럼 깨지는 현상 반복 (Tailwind/글로벌 CSS 미적용)
- `.next/server/pages/_document.js` 관련 에러 발생

## 해결

### 1. 라우터 구조 단일화
- ✅ 프로젝트에는 `pages` 디렉토리가 없음 (확인 완료)
- ✅ `src/app` 디렉토리만 사용 (App Router)
- ✅ `pages/_app.tsx`, `pages/_document.tsx`, `pages/index.tsx` 없음 (확인 완료)

### 2. 글로벌 CSS 연결 고정
- ✅ `src/app/layout.tsx`에 `import './globals.css'` 존재 (확인 완료)
- ✅ `src/app/globals.css`에 `@tailwind` 지시문 정상 (확인 완료)
- ✅ 폰트 import는 `<head>`에 `<link>` 태그로 이동 (완료)

### 3. Tailwind 설정 고정
- ✅ `tailwind.config.ts`에서 `pages` 경로 제거
- ✅ Content paths: `./src/app/**/*`, `./src/components/**/*`, `./src/**/*`만 포함

### 4. 개발 환경 리셋 스크립트 보강
- ✅ `scripts/dev-reset.ps1`에서 캐시 항상 삭제
- ✅ `.next`, `.turbo`, `node_modules\.cache` 삭제 보강 (재시도 로직 포함)
- ✅ `npm run dev:reset` 실행 시 깨끗한 상태로 시작

## 재발 방지

### 캐시 문제 발생 시:
```bash
npm run dev:reset
```

이 명령어는 다음을 수행합니다:
1. 모든 Node.js 프로세스 종료
2. `.next`, `.turbo`, `node_modules\.cache` 완전 삭제
3. 포트 정리 (3000-3010)
4. 의존성 확인 및 설치 (필요 시)
5. 개발 서버 재시작

### 확인 사항
- ✅ `src/app/layout.tsx`에 `import './globals.css'` 1곳만 존재
- ✅ `tailwind.config.ts` content에 실제 경로만 포함 (pages 경로 없음)
- ✅ 프로젝트에 `pages` 디렉토리 없음
- ✅ 빌드 성공 시 CSS 파일이 정상 생성되는지 확인

## 주의사항
- `.next/server/pages` 디렉토리는 Next.js 15가 자동으로 생성할 수 있으나, 이것은 내부 구현입니다
- 실제로 `pages` 디렉토리가 없으면 라우팅은 App Router만 사용됩니다
- CSS 문제는 빌드 캐시 손상 시 발생하므로, `dev:reset`으로 해결 가능합니다
