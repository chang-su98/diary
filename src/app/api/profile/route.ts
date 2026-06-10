import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import { profileUpdateSchema } from "@/lib/schemas/profile";

const PROFILE_SELECT = {
  username: true,
  displayName: true,
  birthday: true,
  email: true,
  avatar: true,
} as const;

export async function GET() {
  try {
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
  } catch (error) {
    console.error("[GET /api/profile]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
    }
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.warn("[PATCH /api/profile] Request body 파싱 실패:", error);
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[PATCH /api/profile] 입력 검증 실패:", parsed.error.issues);
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    // 키가 존재하는 필드만 갱신(undefined=미수정, null=값 비움)
    const p = parsed.data;
    const data: {
      displayName?: string | null;
      email?: string | null;
      birthday?: Date | null;
      avatar?: string | null;
    } = {};
    if (p.displayName !== undefined) data.displayName = p.displayName;
    if (p.email !== undefined) data.email = p.email;
    if (p.birthday !== undefined) {
      // YYYY-MM-DD → UTC 자정으로 통일(표시도 UTC 기준으로 환원)
      data.birthday = p.birthday === null ? null : new Date(`${p.birthday}T00:00:00Z`);
    }
    if (p.avatar !== undefined) data.avatar = p.avatar;

    // 응답으로 큰 avatar data URL을 되돌리지 않는다(클라는 router.refresh로 재조회).
    await prisma.user.update({
      where: { id: Number(session.sub) },
      data,
      select: { id: true },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/profile]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
