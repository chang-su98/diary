import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Compiler 활성화 — 컴포넌트 렌더링 자동 최적화(수동 useMemo/useCallback 불필요)
  reactCompiler: true,
};

export default nextConfig;
