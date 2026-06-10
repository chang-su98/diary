import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import { photoCreateSchema } from "@/lib/schemas/photo";

// 사진 목록 조회 — 최신순
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const photos = await prisma.photo.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, data: true, width: true, height: true, createdAt: true },
    });
    return NextResponse.json({ photos });
  } catch (error) {
    console.error("[GET /api/photos]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// 사진 업로드
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
      console.warn("[POST /api/photos] Request body 파싱 실패:", error);
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const parsed = photoCreateSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[POST /api/photos] 입력 검증 실패:", parsed.error.issues);
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const authorId = Number(session.sub);
    if (!Number.isInteger(authorId)) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { data, width, height } = parsed.data;
    const photo = await prisma.photo.create({
      data: { data, width, height, authorId }, // 올린 사용자를 작성자로 기록
      select: { id: true, data: true, width: true, height: true, createdAt: true },
    });
    return NextResponse.json({ photo }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/photos]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
