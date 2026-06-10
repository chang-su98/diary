import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import { anniversaryCreateSchema } from "@/lib/schemas/anniversary";

// 기념일 목록 조회
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const anniversaries = await prisma.anniversary.findMany({
      orderBy: { date: "asc" },
      include: { author: { select: { displayName: true, username: true } } },
    });
    return NextResponse.json({ anniversaries });
  } catch (error) {
    console.error("[GET /api/anniversaries]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// 기념일 생성
export async function POST(req: NextRequest) {
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
      console.warn("[POST /api/anniversaries] Request body 파싱 실패:", error);
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const parsed = anniversaryCreateSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[POST /api/anniversaries] 입력 검증 실패:", parsed.error.issues);
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const { title, date, yearly } = parsed.data;
    const anniversary = await prisma.anniversary.create({
      data: {
        title,
        date: new Date(`${date}T00:00:00Z`),
        yearly,
        authorId: Number(session.sub), // 로그인 사용자를 작성자로 기록
      },
    });
    return NextResponse.json({ anniversary }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/anniversaries]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
