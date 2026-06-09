import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/security";

export async function POST(req: NextRequest) {
  // CSRF 1차 방어 — 동일 출처 요청만 허용
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  // 실패 응답은 항상 동일(아이디 존재 여부 노출 방지)
  const invalid = NextResponse.json(
    { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
    { status: 401 }
  );

  const username = body?.username;
  const password = body?.password;
  if (typeof username !== "string" || typeof password !== "string") {
    return invalid;
  }
  // 입력 길이 상한 — bcrypt 72바이트 절단 및 과대 입력 해시 비용(DoS 표면) 방지
  if (username.length > 50 || password.length > 128) {
    return invalid;
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    // 타이밍 평준화 — 사용자 없을 때도 유사한 연산 시간 소비
    await bcrypt.hash(password, 12);
    return invalid;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return invalid;

  const token = await signSession({
    sub: String(user.id),
    username: user.username,
  });

  const res = NextResponse.json({
    ok: true,
    user: { username: user.username, displayName: user.displayName },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
