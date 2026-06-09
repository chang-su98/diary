"use client";

import { useEffect } from "react";

/**
 * 서비스워커를 등록하는 클라이언트 컴포넌트.
 * 개발 중에는 SW 캐시 혼선을 피하기 위해 production 빌드에서만 등록한다.
 */
export function PWARegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 등록 실패는 앱 동작에 영향 없으므로 조용히 무시
    });
  }, []);

  return null;
}
