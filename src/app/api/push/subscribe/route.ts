import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/lib/schemas/push";

// 푸시 구독 저장(upsert) — 같은 endpoint면 소유자만 갱신.
export async function POST(req: NextRequest) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
    }
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const userId = Number(session.sub);
    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.warn("[POST /api/push/subscribe] Request body 파싱 실패:", error);
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const parsed = pushSubscribeSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[POST /api/push/subscribe] 입력 검증 실패:", parsed.error.issues);
      return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
    }
    const { endpoint, keys } = parsed.data;

    // endpoint는 브라우저/프로필 단위로 unique. 같은 기기가 다시 구독하면 소유자/키를
    // "현재 로그인 사용자"로 갱신한다. 공용 기기를 두 사람이 번갈아 쓰는 경우(폐쇄형 2인 앱),
    // 알림은 "그 기기를 지금 쓰는 사람"에게 가는 것이 맞으므로 소유권 이전은 의도된 동작이다.
    // (이전 사용자는 같은 기기에서 더 이상 알림을 받지 않음 — 정상)
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/push/subscribe]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// 구독 해지 — 본인 소유 endpoint만 제거.
export async function DELETE(req: NextRequest) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
    }
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const userId = Number(session.sub);
    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.warn("[DELETE /api/push/subscribe] Request body 파싱 실패:", error);
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const parsed = pushUnsubscribeSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[DELETE /api/push/subscribe] 입력 검증 실패:", parsed.error.issues);
      return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
    }

    // 본인 소유만 삭제(다른 사용자 endpoint를 임의 삭제하지 못하게 userId 조건 포함)
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, userId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/push/subscribe]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
