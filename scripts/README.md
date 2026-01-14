# 개발 스크립트

## dev-reset.ps1

Next.js 개발 환경 리셋 스크립트입니다.

### 기능

1. **Node.js 프로세스 종료**: 실행 중인 모든 Node.js 프로세스를 종료합니다.
2. **캐시 디렉토리 삭제**: `.next`, `.turbo`, `node_modules\.cache` 디렉토리를 삭제합니다.
3. **포트 정리**: 3000-3010 포트 범위에서 사용 중인 포트를 해제합니다.
4. **의존성 확인**: `package-lock.json`이 변경되었을 경우 `npm install`을 실행합니다.
5. **개발 서버 시작**: `npm run dev`를 실행하여 개발 서버를 시작합니다.

### 사용 방법

```bash
npm run dev:reset
```

또는 직접 실행:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev-reset.ps1
```

### 문제 해결

**`.next` 청크 누락 오류 (`Cannot find module './###.js'`)가 발생할 때:**

1. `npm run dev:reset` 실행
2. 모든 캐시와 프로세스가 정리되고 개발 서버가 재시작됩니다.

### 주의사항

- PowerShell 실행 정책이 제한되어 있을 경우 `-ExecutionPolicy Bypass` 옵션이 필요할 수 있습니다.
- 스크립트 실행 중 오류가 발생해도 계속 진행됩니다 (실패해도 무시하고 다음 단계로 진행).
