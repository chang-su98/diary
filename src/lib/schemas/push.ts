import { z } from "zod";

// 브라우저 PushSubscription(JSON) — 서버 저장용 최소 필드 검증.
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

// 구독 해지 — 엔드포인트로 식별.
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
});
