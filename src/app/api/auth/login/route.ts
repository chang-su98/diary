import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export async function POST(req: NextRequest) {
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
