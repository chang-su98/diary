import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";

// 리사이즈된 아바타 data URL 길이 상한(약 220KB 이미지 수준)
const MAX_AVATAR_CHARS = 300_000;

const PROFILE_SELECT = {
  username: true,
  displayName: true,
  birthday: true,
  bio: true,
  avatar: true,
} as const;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: Number(session.sub) },
    select: PROFILE_SELECT,
  });
  if (!user) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const bad = () =>
    NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });

  const data: {
    displayName?: string | null;
    birthday?: Date | null;
    bio?: string | null;
    avatar?: string | null;
  } = {};

  if ("displayName" in body) {
    const v = body.displayName;
    if (v !== null && (typeof v !== "string" || v.length > 50)) return bad();
    data.displayName = v ? v : null;
  }
  if ("bio" in body) {
    const v = body.bio;
    if (v !== null && (typeof v !== "string" || v.length > 200)) return bad();
    data.bio = v ? v : null;
  }
  if ("birthday" in body) {
    const v = body.birthday;
    if (v === null || v === "") {
      data.birthday = null;
    } else if (typeof v === "string") {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return bad();
      data.birthday = d;
    } else {
      return bad();
    }
  }
  if ("avatar" in body) {
    const v = body.avatar;
    if (v === null || v === "") {
      data.avatar = null;
    } else if (
      typeof v === "string" &&
      v.startsWith("data:image/") &&
      v.length <= MAX_AVATAR_CHARS
    ) {
      data.avatar = v;
    } else {
      return bad();
    }
  }

  const user = await prisma.user.update({
    where: { id: Number(session.sub) },
    data,
    select: PROFILE_SELECT,
  });
  return NextResponse.json({ user });
}
