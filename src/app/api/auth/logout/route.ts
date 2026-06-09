import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/security";

export async function POST(req: NextRequest) {
  // CSRF 1차 방어 — 동일 출처 요청만 허용
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  // 쿠키 즉시 만료
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
