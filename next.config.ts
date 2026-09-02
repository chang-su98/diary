import type { NextConfig } from "next";

// 앱 전역 CSP. 외부 스크립트·폰트·분석 도구가 없어(next/font/google는 빌드 시 self 호스팅)
// 대부분 'self'로 충분하다. 예외:
//   - img-src data:  → 아바타를 data URL로 <img> 렌더(profile/gallery)
//   - img-src blob:  → 업로드 미리보기 objectURL 여지
//   - script/style 'unsafe-inline' → Next App Router 하이드레이션 인라인 스크립트와
//     Tailwind/Next 인라인 스타일 때문에 필요. nonce 기반 강화는 middleware 도입 시 후속 과제.
// 실질 이득: frame-ancestors 'none'(클릭재킹), object-src 'none', base-uri 'self' 등.
// dev 예외(운영 빌드엔 미적용):
//   - 'unsafe-eval' → React dev 빌드·Turbopack HMR이 eval을 쓴다.
//   - upgrade-insecure-requests 제외 → LAN IP(http) 접근이 https로 강제 업그레이드돼 죽는다.
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

// 모든 응답에 붙는 보안 헤더(심층 방어).
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // CSP 미지원/우회 대비 클릭재킹 이중 방어
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  // HTTPS 강제(운영). dev http에서는 브라우저가 무시하므로 무해.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // 사용하지 않는 브라우저 기능 차단
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // React Compiler 활성화 — 컴포넌트 렌더링 자동 최적화(수동 useMemo/useCallback 불필요)
  reactCompiler: true,
  // dev 서버를 LAN IP(휴대폰 등 같은 네트워크 기기)로 접근할 때 cross-origin 차단 해제.
  // next dev는 localhost 기준이라, IP 접근 시 RSC/HMR 등 dev 엔드포인트가 막혀
  // 로그인 후 클라이언트 내비게이션이 동작하지 않는다. (운영 빌드와 무관)
  allowedDevOrigins: ["172.30.1.54", "172.30.1.*"],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
