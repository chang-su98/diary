"use client";

/**
 * 앱 콜드 스타트 시 한 번 노출되는 로딩 스플래시.
 * layout body에 위치 — client navigation에선 리마운트되지 않으므로 첫 진입에만 보인다.
 * setState 없이 순수 CSS 애니메이션으로 페이드아웃 후 visibility:hidden 처리해
 * React Compiler의 set-state-in-effect 룰과 충돌하지 않는다.
 * (prefers-reduced-motion 사용자는 globals.css 전역 규칙으로 즉시 숨김 처리)
 */
export function Splash() {
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
