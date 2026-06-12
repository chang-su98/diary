"use client";

import { useEffect } from "react";

// animate-splash(splash-out 1s)와 일치 — 이 시간 뒤 홈 진입 애니메이션을 시작시킨다.
const SPLASH_MS = 1000;

/**
 * 앱 콜드 스타트 시 한 번 노출되는 로딩 스플래시.
 * layout body에 위치 — client navigation에선 리마운트되지 않으므로 첫 진입에만 보인다.
 * setState 없이 순수 CSS 애니메이션으로 페이드아웃 후 visibility:hidden 처리해
 * React Compiler의 set-state-in-effect 룰과 충돌하지 않는다.
 * (prefers-reduced-motion 사용자는 globals.css 전역 규칙으로 즉시 숨김 처리)
 *
 * 스플래시가 끝나면 <html>.splash-done 클래스 + "splash-done" 이벤트로 신호를 보낸다.
 * 홈의 라인 드로잉·섹션 fade-in이 이 신호 뒤에 시작된다(클래스 토글만 — setState 미사용).
 */
export function Splash() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains("splash-done")) return; // 이미 완료(클라 내비 등)
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const t = window.setTimeout(
      () => {
        root.classList.add("splash-done");
        window.dispatchEvent(new Event("splash-done"));
      },
      reduced ? 0 : SPLASH_MS
    );
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      aria-hidden
      className="animate-splash fixed inset-0 z-50 flex items-center justify-center bg-bg"
    >
      <span className="pl-[0.45em] text-3xl font-light tracking-[0.45em] text-text">
        RECORD
      </span>
    </div>
  );
}
