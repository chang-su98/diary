import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import {
  MAX_PHOTO_BYTES,
  photoCreateSchema,
  photoDeleteSchema,
} from "@/lib/schemas/photo";
import { dataUrlToBuffer, getStorage } from "@/lib/storage";

// 갤러리 한 페이지 크기 — 페이지·API 공통
export const PHOTO_PAGE_SIZE = 15;

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

    const { data, width, height } = parsed.data;

    // base64 → 바이너리로 디코드해 스토리지에 저장하고 DB엔 key만 보관
    const full = dataUrlToBuffer(data);
    if (!full) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    // 디코드된 실제 바이트 상한 검증 — base64 문자 수 상한(스키마)과 별개로
    // 서버에서 디코드 크기를 직접 확인(과대 페이로드/메모리 스파이크 차단).
    const bytes = full.buffer.length;
    if (bytes > MAX_PHOTO_BYTES) {
      console.warn(
        `[POST /api/photos] 이미지 크기 초과: ${bytes} > ${MAX_PHOTO_BYTES}`
      );
      return NextResponse.json(
        { error: "이미지 용량이 너무 큽니다." },
        { status: 400 }
      );
    }

    // 스토리지 용량 가드 — R2 무료 한도(10GB) 초과 방지(기본 9.5GB).
    // 누적 바이트 합 + 이번 업로드가 상한을 넘으면 거절(스토리지·DB 쓰기 전에 중단).
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
    const storage = getStorage();
    await storage.put(dataKey, full.buffer, full.contentType);

    const photo = await prisma.photo.create({
      data: { dataKey, width, height, bytes, authorId }, // 올린 사용자를 작성자로 기록
      select: { id: true },
    });

    // 사전 검사(aggregate)와 create 사이에는 경합 구간이 있어(동시 업로드가
    // 같은 used 합을 읽고 각자 통과) 한도를 소폭 넘길 수 있다. create 직후
    // 합계를 재확인해 실제로 초과했으면 방금 만든 행·객체를 롤백한다.
    // 주의: 이 재확인은 경합을 "완전히" 해소하지 않는다(소규모 동시성 가정의
    // best-effort 가드). 강한 보장이 필요하면 bytes 누적을 단일 카운터 행의
    // 원자적 증가나 트랜잭션 잠금으로 옮겨야 한다.
    const usedAfter =
      (await prisma.photo.aggregate({ _sum: { bytes: true } }))._sum.bytes ?? 0;
    if (usedAfter > STORAGE_MAX_BYTES) {
      console.warn(
        `[POST /api/photos] 경합으로 한도 초과 — 롤백: usedAfter=${usedAfter} > ${STORAGE_MAX_BYTES}`
      );
      // 롤백 실패 시 그 행의 bytes가 used 집계를 영구 오염시키므로(이후 업로드를
      // 잘못 차단) 운영자가 수동 정리할 수 있게 id·dataKey를 경보 로그로 남긴다.
      const rollbackOk = await prisma.photo
        .delete({ where: { id: photo.id } })
        .then(() => true)
        .catch((e: unknown) => {
          console.error(
            `[POST /api/photos][ALERT] 롤백(DB) 실패 — 수동 정리 필요: id=${photo.id} key=${dataKey}`,
            e
          );
          return false;
        });
      // DB 행이 남았다면 스토리지 객체도 유지해 정합성 확인이 가능하게 한다.
      if (rollbackOk) {
        await storage.delete(dataKey).catch((e: unknown) =>
          console.error(
            `[POST /api/photos][ALERT] 롤백(스토리지) 실패 — 고아 객체: key=${dataKey}`,
            e
          )
        );
      }
      return NextResponse.json(
        { error: "저장 공간이 가득 찼어요. 무료 용량 한도에 도달했습니다." },
        { status: 507 }
      );
    }

    return NextResponse.json({ photo }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/photos]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// 사진 일괄 삭제 — 공유 권한(인증만 되면 누구 사진이든 삭제).
// DB 행을 먼저 지우고 스토리지 객체는 best-effort 정리한다.
// (순서가 뒤집혀 실패하면 "행은 있는데 파일 없는 깨진 이미지"가 생긴다.
//  DB 먼저면 최악이 "고아 파일"이라 덜 해롭다.)
export async function DELETE(req: NextRequest) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json(
        { error: "허용되지 않은 요청입니다." },
        { status: 403 }
      );
    }
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.warn("[DELETE /api/photos] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "잘못된 요청입니다." },
        { status: 400 }
      );
    }

    const parsed = photoDeleteSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[DELETE /api/photos] 입력 검증 실패:", parsed.error.issues);
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }
    const { ids } = parsed.data;

    // 행 삭제 전에 스토리지 키 수집
    const targets = await prisma.photo.findMany({
      where: { id: { in: ids } },
      select: { dataKey: true, thumbKey: true },
    });

    // DB 먼저 삭제
    const { count } = await prisma.photo.deleteMany({
      where: { id: { in: ids } },
    });

    // 스토리지 best-effort 정리 — 실패해도 요청은 성공 처리(고아 파일만 남음)
    const keys = targets
      .flatMap((p) => [p.dataKey, p.thumbKey])
      .filter((k): k is string => typeof k === "string");
    if (keys.length > 0) {
      const storage = getStorage();
      const results = await Promise.allSettled(
        keys.map((k) => storage.delete(k))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        console.warn(
          `[DELETE /api/photos] 스토리지 정리 일부 실패: ${failed}/${keys.length}`
        );
      }
    }

    return NextResponse.json({ deleted: count });
  } catch (error) {
    console.error("[DELETE /api/photos]", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
