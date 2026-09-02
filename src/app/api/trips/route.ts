import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import { tripCreateSchema } from "@/lib/schemas/trip";

// 여행 계획 목록 조회 — 시작일 오름차순(다가오는 순)
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const trips = await prisma.trip.findMany({
      orderBy: { startDate: "asc" },
      include: { author: { select: { displayName: true, username: true } } },
    });
    return NextResponse.json({ trips });
  } catch (error) {
    console.error("[GET /api/trips]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// 여행 계획 생성
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
      console.warn("[POST /api/trips] Request body 파싱 실패:", error);
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const parsed = tripCreateSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[POST /api/trips] 입력 검증 실패:", parsed.error.issues);
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const authorId = Number(session.sub);
    if (!Number.isInteger(authorId)) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { title, startDate, endDate } = parsed.data;
    const trip = await prisma.trip.create({
      data: {
        title,
        startDate: new Date(`${startDate}T00:00:00Z`),
        endDate: new Date(`${endDate}T00:00:00Z`),
        authorId,
      },
      select: { id: true },
    });

    return NextResponse.json({ trip }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/trips]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
