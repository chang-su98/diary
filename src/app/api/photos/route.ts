import { randomUUID } from "crypto";
import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import {
  MAX_PHOTO_BYTES,
  photoCreateSchema,
  photoDeleteSchema,
} from "@/lib/schemas/photo";
import { dataUrlToBuffer, getStorage } from "@/lib/storage";
import { sendPushToOthers } from "@/lib/push";

// 갤러리 한 페이지 크기 — 페이지·API 공통
export const PHOTO_PAGE_SIZE = 15;

// 일괄 업로드 알림 디바운스 윈도우(ms). 클라이언트가 장당 1회 POST를 동시성 3으로
// 보내므로, 이 윈도우 안의 연속/동시 업로드는 한 번만 발송한다(화면 표시도 고정 tag로 1개).
// 주의: 윈도우 내 "다음 배치"도 억제된다(스로틀 의미상 의도된 동작).
const UPLOAD_NOTIFY_DEBOUNCE_MS = 60_000;

// throttle key — 유한 카디널리티(이벤트:userId)여야 한다. 가변 id 기반 key를 쓰면
// notify_throttles 행이 무한 증가하므로, 그 경우 별도 TTL 정리가 필요하다(현재는 사용자 수 고정).
function uploadNotifyKey(userId: number): string {
  return `photo-upload:${userId}`;
}

// 사진 업로드 알림 발송권을 원자적으로 획득한다.
// 반환: 획득한 발송 시각(Date) = 이 호출이 발송 담당 / null = 다른 호출이 선점(발송 안 함).
// 조건부 updateMany는 윈도우가 지난 단 하나의 동시 호출에만 count=1을 부여하고,
// 행이 없으면 create의 unique(@id) 충돌로 단일 호출만 선점 → 동시 업로드 중복 발송 차단.
async function claimUploadNotify(userId: number): Promise<Date | null> {
  const key = uploadNotifyKey(userId);
  const now = new Date();
  const cutoff = new Date(now.getTime() - UPLOAD_NOTIFY_DEBOUNCE_MS);
  const { count } = await prisma.notifyThrottle.updateMany({
    where: { key, lastNotifiedAt: { lt: cutoff } },
    data: { lastNotifiedAt: now },
  });
  if (count > 0) return now;
  // 갱신 0건: 행이 없거나(최초) 윈도우 내(다른 호출이 이미 선점). 최초면 생성으로 선점 시도.
  try {
    await prisma.notifyThrottle.create({ data: { key, lastNotifiedAt: now } });
    return now;
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return null; // 다른 동시 호출이 먼저 생성/발송함
    }
    throw error;
  }
}

// 획득한 발송권을 되돌린다(best-effort, 조건부).
// 발송을 "시도하기 전" 단계(예: 작성자 DB 조회) 실패 시에만 호출해, 소모된 윈도우 동안
// 알림이 유실되지 않고 다음 업로드가 재시도하게 한다. claimedAt(내가 세운 값)과 일치할
// 때만 무효화하므로, 그 사이 다른 업로드가 윈도우를 갱신했으면 no-op → 중복 알림 방지.
// 참고: 실제 푸시 "전송" 실패는 best-effort라 sendPushToOthers 내부에서 삼켜지며(여기로
// 전파되지 않음), 그 경우 윈도우 소모는 의도된 동작이다(성공 기기 중복 발송 방지).
async function releaseUploadNotify(userId: number, claimedAt: Date): Promise<void> {
  await prisma.notifyThrottle
    .updateMany({
      where: { key: uploadNotifyKey(userId), lastNotifiedAt: claimedAt },
      data: { lastNotifiedAt: new Date(0) }, // 즉시 윈도우 만료 처리
    })
    .catch(() => {});
}

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
  createdAt: true, // 상세 모달 날짜 표시용 — NextResponse.json이 ISO 문자열로 직렬화
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

    // 상대방에게 새 사진 알림(베스트 에포트) — 응답 후 백그라운드 발송, 실패는 격리.
    // 일괄 업로드는 throttle로 발송권을 원자적으로 단일 호출에만 부여해(동시 업로드여도)
    // 한 번만 발송하고, 고정 tag로 화면 표시도 1개만 갱신되게 한다.
    after(async () => {
      let claimedAt: Date | null = null;
      try {
        claimedAt = await claimUploadNotify(authorId);
        if (!claimedAt) return;

        const author = await prisma.user.findUnique({
          where: { id: authorId },
          select: { displayName: true, username: true },
        });
        const name = (
          author?.displayName ||
          author?.username ||
          "상대방"
        ).slice(0, 40);
        await sendPushToOthers(authorId, {
          title: "Record",
          body: `${name}님이 새 사진을 올렸어요 📷`,
          url: "/gallery",
          tag: "photo-upload", // 연속·일괄 업로드 알림은 하나로 갱신
        });
      } catch (error: unknown) {
        console.warn("[POST /api/photos] 푸시 발송 실패:", error);
        // 발송 시도 전 단계(작성자 조회 등) 실패 시에만 윈도우를 되돌려 다음 업로드가
        // 재알림하게 한다(best-effort). 실제 푸시 전송 실패는 여기로 전파되지 않는다.
        if (claimedAt) await releaseUploadNotify(authorId, claimedAt);
      }
    });

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
