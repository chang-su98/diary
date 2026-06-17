"use client";

import { useEffect } from "react";

/**
 * 서비스워커를 등록하는 클라이언트 컴포넌트.
 * 기본적으로 production 빌드에서만 등록한다(개발 중 SW 캐시 혼선 방지).
 * 단 NEXT_PUBLIC_DEV_SW=1이면 dev에서도 등록해 로컬에서 푸시/알림 토글을 테스트할 수 있다.
 */
export function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const devOptIn = process.env.NEXT_PUBLIC_DEV_SW === "1";
    if (process.env.NODE_ENV !== "production" && !devOptIn) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 등록 실패는 앱 동작에 영향 없으므로 조용히 무시
    });
  }, []);

  return null;
}
