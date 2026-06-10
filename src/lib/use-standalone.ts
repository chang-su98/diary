"use client";

import { useSyncExternalStore } from "react";

const STANDALONE_QUERY = "(display-mode: standalone)";

// iOS Safari 레거시: navigator.standalone (비표준) — any 대신 교차 타입으로 좁힘
type IosNavigator = Navigator & { standalone?: boolean };

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(STANDALONE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot() {
  const nav = window.navigator as IosNavigator;
  return window.matchMedia(STANDALONE_QUERY).matches || nav.standalone === true;
}

// SSR/초기 렌더에서는 false — hydration 불일치·effect 내 setState 없이 안전
function getServerSnapshot() {
  return false;
}

/**
 * 홈 화면에 설치된 PWA(standalone) 여부를 반환한다.
 * 브라우저 탭에서는 false, 설치 후 실행 시 true.
 */
export function useStandalone() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
