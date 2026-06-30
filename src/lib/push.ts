import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// VAPID 설정 — 환경변수 3종이 모두 있을 때만 활성화. 하나라도 없으면 발송을 건너뛴다
// (앱 동작에는 영향 없음 — 알림만 비활성).
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT;

let configured = false;

export function isPushConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY || !SUBJECT) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * 한 사용자의 모든 구독 기기로 푸시를 발송한다(베스트 에포트).
 * 만료·해지된 구독(404/410)은 정리하고, 그 외 오류는 로그만 남긴다.
 */
export async function sendPushToUser(
  userId: number,
  payload: PushPayload
): Promise<void> {
  if (!isPushConfigured()) {
    console.warn("[push] VAPID 미설정 — 발송 건너뜀");
    return;
  }
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await deliverToSubscriptions(subs, payload);
}

/**
 * 본인(excludeUserId)을 제외한 모든 사용자에게 같은 푸시를 발송한다(베스트 에포트).
 * 폐쇄형 2인 공유 앱에선 사실상 "상대방에게" 보내는 용도.
 * 대상 구독을 단일 쿼리로 가져와 발송한다(사용자별 반복 조회 없음).
 */
export async function sendPushToOthers(
  excludeUserId: number,
  payload: PushPayload
): Promise<void> {
  if (!isPushConfigured()) {
    console.warn("[push] VAPID 미설정 — 발송 건너뜀");
    return;
  }
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { not: excludeUserId } },
  });
  await deliverToSubscriptions(subs, payload);
}

/**
 * 모든 사용자의 모든 구독 기기로 같은 푸시를 발송한다(베스트 에포트).
 * 폐쇄형 2인 앱에서 "두 사람 모두에게"가 필요한 경우(예: 일정 하루 전 리마인더)에 쓴다.
 */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) {
    console.warn("[push] VAPID 미설정 — 발송 건너뜀");
    return;
  }
  const subs = await prisma.pushSubscription.findMany();
  await deliverToSubscriptions(subs, payload);
}

// 구독 목록으로 실제 발송하는 내부 구현(VAPID 설정·대상 조회는 호출부가 보장).
// 만료·해지된 구독(404/410)은 정리하고, 그 외 오류는 status만 로그로 남긴다.
type DeliverableSub = { id: number; endpoint: string; p256dh: string; auth: string };

async function deliverToSubscriptions(
  subs: DeliverableSub[],
  payload: PushPayload
): Promise<void> {
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
      } catch (error: unknown) {
        const status =
          typeof error === "object" && error !== null && "statusCode" in error
            ? (error as { statusCode?: number }).statusCode
            : undefined;
        // 404/410 = 구독 만료/해지 → DB에서 제거(다음 발송 대상에서 빠짐)
        if (status === 404 || status === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: s.id } })
            .catch(() => {});
        } else {
          // error 객체 통째 로깅 금지 — WebPushError는 endpoint(토큰성 식별 URL)·
          // headers 등 민감값을 포함할 수 있어 status 또는 message만 남긴다.
          const message = error instanceof Error ? error.message : String(error);
          console.warn("[push] 발송 실패:", status ?? message);
        }
      }
    })
  );
}
