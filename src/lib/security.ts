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

// 프록시(Vercel) 뒤 클라이언트 IP 추정. rate limit 버킷 키에 사용.
// x-forwarded-for 첫 홉(가장 왼쪽=원 클라이언트) 우선, 없으면 x-real-ip.
// 헤더가 전혀 없으면 null → 호출부가 "공용 unknown 버킷" 대신 계정 기준으로 더 엄격히 처리.
export function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || null;
}
