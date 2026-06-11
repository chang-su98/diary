import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import { photoCreateSchema } from "@/lib/schemas/photo";

// 갤러리 한 페이지 크기 — 페이지·API 공통
export const PHOTO_PAGE_SIZE = 10;

// 그리드용 — 원본(data)은 제외하고 썸네일(thumb)만. 원본은 상세 라우트에서 별도 로드.
// author는 등록자 표시용(삭제 시 null).
const photoSelect = {
  id: true,
  thumb: true,
  width: true,
  height: true,
  author: { select: { username: true, displayName: true, avatar: true } },
} as const;

// 커서 기반 페이지네이션 — id desc(=최신순, autoincrement)로 cursor 미만을 take
const photosQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(PHOTO_PAGE_SIZE),
});

// 사진 목록 조회 — 최신순, 커서 페이지네이션
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = photosQuerySchema.safeParse({
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      console.warn("[GET /api/photos] 쿼리 검증 실패:", parsed.error.issues);
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    const { cursor, limit } = parsed.data;

    const photos = await prisma.photo.findMany({
      where: cursor ? { id: { lt: cursor } } : undefined,
      orderBy: { id: "desc" },
      take: limit,
      select: photoSelect,
    });
    // 정확히 limit개면 다음 페이지가 있을 수 있음 → 마지막 id를 커서로
    const nextCursor =
      photos.length === limit ? photos[photos.length - 1].id : null;

    return NextResponse.json({ photos, nextCursor });
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

    const { data, thumb, width, height } = parsed.data;
    const photo = await prisma.photo.create({
      data: { data, thumb, width, height, authorId }, // 올린 사용자를 작성자로 기록
      select: { id: true },
    });
    return NextResponse.json({ photo }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/photos]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
