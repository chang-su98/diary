import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { getClientIp, isSameOriginRequest } from "@/lib/security";
import { hitRateLimit } from "@/lib/rate-limit";

// 브루트포스 방어 rate limit — 요청 자체 기준(성공/실패 무관, rules/api.md).
const RL_WINDOW_MS = 10 * 60 * 1000; // 10분 고정 윈도우
const RL_IP_MAX = 10; // IP당 10분 10회
const RL_ACCOUNT_MAX = 5; // 계정당 10분 5회(특정 계정 표적 방어)
const RL_ACCOUNT_MAX_NO_IP = 3; // IP 헤더 없으면 계정 기준을 더 엄격히

export async function POST(req: NextRequest) {
  try {
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

    // Rate limit — user 조회·bcrypt 이전에 소비(해시 DoS 표면도 함께 차단).
    // 계정 기준(대소문자 무관 그룹핑)과 IP 기준 이중 적용. IP 헤더가 없으면 공용
    // unknown 버킷 대신 계정 기준만 더 엄격히 본다(rules/api.md).
    const ip = getClientIp(req);
    const accountMax = ip ? RL_ACCOUNT_MAX : RL_ACCOUNT_MAX_NO_IP;
    const account = await hitRateLimit(
      `login:user:${username.toLowerCase()}`,
      RL_WINDOW_MS,
      accountMax
    );
    let limited = account.limited;
    let retryAfterSec = account.retryAfterSec;
    if (ip) {
      const byIp = await hitRateLimit(`login:ip:${ip}`, RL_WINDOW_MS, RL_IP_MAX);
      limited = limited || byIp.limited;
      retryAfterSec = Math.max(retryAfterSec, byIp.retryAfterSec);
    }
    if (limited) {
      return NextResponse.json(
        { error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
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
  } catch (error) {
    console.error("[POST /api/auth/login]", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
