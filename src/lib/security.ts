import type { NextRequest } from "next/server";

// 상태 변경 요청(POST 등)의 CSRF 1차 방어 — 동일 출처에서 온 요청만 허용.
// SameSite=Lax 쿠키와 함께 이중 방어.
export function isSameOriginRequest(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) {
    // 모던 브라우저: 동일 출처 또는 직접 탐색(none)만 허용, cross-site/same-site 거부
    return site === "same-origin" || site === "none";
  }
  // Sec-Fetch-Site 미지원 클라이언트 → Origin 호스트 대조
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
