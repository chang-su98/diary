import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import { photoCreateSchema } from "@/lib/schemas/photo";
import { dataUrlToBuffer, getStorage } from "@/lib/storage";

// 갤러리 한 페이지 크기 — 페이지·API 공통
export const PHOTO_PAGE_SIZE = 10;

// 스토리지 용량 상한(바이트). R2 무료 10GB 대비 여유(기본 9.5GB). env로 조정 가능.
const STORAGE_MAX_BYTES = Number(
  process.env.STORAGE_MAX_BYTES ?? 9_500_000_000
);

// 그리드용 — 이미지 바이트는 스토리지에 있으므로 메타만 반환(클라이언트가 /raw URL 구성).
// author는 등록자 표시용(삭제 시 null).
const photoSelect = {
  id: true,
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

    // base64 → 바이너리로 디코드해 스토리지에 저장하고 DB엔 key만 보관
    const full = dataUrlToBuffer(data);
    const thumbBuf = dataUrlToBuffer(thumb);
    if (!full || !thumbBuf) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    // 스토리지 용량 가드 — R2 무료 한도(10GB) 초과 방지(기본 9GB, 여유 1GB).
    // 누적 바이트 합 + 이번 업로드가 상한을 넘으면 거절(스토리지·DB 쓰기 전에 중단).
    const bytes = full.buffer.length + thumbBuf.buffer.length;
    const used = (await prisma.photo.aggregate({ _sum: { bytes: true } }))._sum
      .bytes ?? 0;
    if (used + bytes > STORAGE_MAX_BYTES) {
      console.warn(
        `[POST /api/photos] 스토리지 한도 초과: used=${used} + ${bytes} > ${STORAGE_MAX_BYTES}`
      );
      return NextResponse.json(
        { error: "저장 공간이 가득 찼어요. 무료 용량 한도에 도달했습니다." },
        { status: 507 }
      );
    }

    const uuid = randomUUID();
    const dataKey = `photos/${uuid}/full.${full.ext}`;
    const thumbKey = `photos/${uuid}/thumb.${thumbBuf.ext}`;
    const storage = getStorage();
    await storage.put(dataKey, full.buffer, full.contentType);
    await storage.put(thumbKey, thumbBuf.buffer, thumbBuf.contentType);

    const photo = await prisma.photo.create({
      // 올린 사용자를 작성자로 기록 (data/thumb base64는 더 이상 저장하지 않음)
      data: { dataKey, thumbKey, width, height, bytes, authorId },
      select: { id: true },
    });
    return NextResponse.json({ photo }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/photos]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
