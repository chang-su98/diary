import { SignJWT, jwtVerify } from "jose";

// JWT 기반 세션 — jose 사용(Edge 미들웨어에서도 검증 가능).
// bcrypt·prisma 같은 Node 전용 모듈을 여기 import 하지 말 것(미들웨어가 Edge에서 돈다).

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7일(초)

export type SessionPayload = {
  sub: string; // user id
  username: string;
};

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) {
    // 안전 기본값을 두지 않는다 — 미설정 시 명확히 실패.
    throw new Error("JWT_SECRET 환경변수가 설정되지 않았습니다.");
  }
  // HS256 권장 강도 — 약한 시크릿/플레이스홀더 거부
  if (s.length < 32) {
    throw new Error("JWT_SECRET는 32자 이상이어야 합니다.");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ username: payload.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.sub !== "string" || typeof payload.username !== "string") {
      return null;
    }
    return { sub: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}
