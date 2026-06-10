import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Compiler 활성화 — 컴포넌트 렌더링 자동 최적화(수동 useMemo/useCallback 불필요)
  reactCompiler: true,
  // dev 서버를 LAN IP(휴대폰 등 같은 네트워크 기기)로 접근할 때 cross-origin 차단 해제.
  // next dev는 localhost 기준이라, IP 접근 시 RSC/HMR 등 dev 엔드포인트가 막혀
  // 로그인 후 클라이언트 내비게이션이 동작하지 않는다. (운영 빌드와 무관)
  allowedDevOrigins: ["172.30.1.54", "172.30.1.*"],
};

export default nextConfig;
