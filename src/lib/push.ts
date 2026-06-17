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
          console.warn("[push] 발송 실패:", status ?? error);
        }
      }
    })
  );
}
