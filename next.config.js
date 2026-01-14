/** @type {import('next').NextConfig} */
// 환경 변수 주입 확인용 로그
console.log("[BOOT_CWD]", process.cwd())
console.log("[BOOT_ENV]", process.env.NEXT_PUBLIC_FEATURE_STEP1_EVIDENCE_AUDIT, process.env.FEATURE_STEP1_EVIDENCE_AUDIT)

const nextConfig = {
  reactStrictMode: true,
  
  // App Router만 사용 (Pages Router 명시적 비활성화)
  // Next.js가 pages 디렉토리를 찾지 않도록 설정
  typescript: {
    // 타입 체크는 유지하되 빌드는 계속 진행
    ignoreBuildErrors: false,
  },
  
  // 캐시 무력화를 위한 설정 (최소 구성)
  experimental: {
    // 서버 컴포넌트 캐시 무력화
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  
  // onDemandEntries 제거: 불안정한 설정으로 인한 크래시 방지
  
  // Pages Router 완전 비활성화 (App Router만 사용)
  // Next.js 15에서는 pages 디렉토리가 없으면 자동으로 App Router만 사용
}

module.exports = nextConfig
