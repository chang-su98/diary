"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// 빌드 타임에 인라인되는 공개키 — 없으면 알림 기능 자체를 숨긴다(미설정 환경 대응).
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

type PushStatus = "unsupported" | "denied" | "off" | "on";

const STATUS_KEY = ["push-status"] as const;

// 브라우저가 웹 푸시를 지원하는지(설치형 PWA·HTTPS 전제).
function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

// VAPID 공개키(base64url) → applicationServerKey용 Uint8Array.
// ArrayBuffer 백킹을 명시해 BufferSource(ArrayBufferView<ArrayBuffer>)로 바로 쓰이게 한다.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * 프로필의 "좋아요 알림" 토글.
 * 구독 상태/토글을 TanStack Query로 관리해 useEffect 내 setState를 쓰지 않는다.
 * 미지원 환경(키 미설정·일반 브라우저 탭·SW 미등록)에서는 렌더하지 않는다.
 */
export function NotificationToggle() {
  const qc = useQueryClient();

  const { data: status } = useQuery<PushStatus>({
    queryKey: STATUS_KEY,
    queryFn: async () => {
      if (!isPushSupported()) return "unsupported";
      // 브라우저/OS 설정에서 알림이 차단된 상태 — 토글로 켤 수 없으니 안내 표시
      if (Notification.permission === "denied") return "denied";
      // SW가 등록돼 있어야 구독 가능 — 개발 모드(미등록)에선 미지원 처리(무한 대기 방지)
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return "unsupported";
      const sub = await reg.pushManager.getSubscription();
      return sub ? "on" : "off";
    },
    staleTime: 0,
  });

  const enable = useMutation({
    mutationFn: async () => {
      const permission = await Notification.requestPermission();
      // 권한 결과("denied"/"default")를 메시지로 전달 → onError에서 상태 동기화
      if (permission !== "granted") throw new Error(permission);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => qc.setQueryData<PushStatus>(STATUS_KEY, "on"),
    onError: (error) => {
      // 권한이 차단되면 토글을 "denied"로 전환해 안내를 띄운다
      if (error instanceof Error && error.message === "denied") {
        qc.setQueryData<PushStatus>(STATUS_KEY, "denied");
      }
      console.warn("[push] 구독 실패:", error);
    },
  });

  const disable = useMutation({
    mutationFn: async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    },
    onSuccess: () => qc.setQueryData<PushStatus>(STATUS_KEY, "off"),
    onError: (error) => console.warn("[push] 구독 해지 실패:", error),
  });

  // 상태 확인 전(undefined)·미지원이면 렌더하지 않음
  if (status === undefined || status === "unsupported") return null;

  const denied = status === "denied";
  const on = status === "on";
  const busy = enable.isPending || disable.isPending;

  return (
    <div className="mt-10 flex items-center justify-between border-b border-line py-5">
      <div>
        <p className="text-sm">좋아요 알림</p>
        <p className="mt-1 text-xs text-text-muted">
          {denied
            ? "브라우저 설정에서 알림을 허용해 주세요"
            : "내 사진에 좋아요가 달리면 알림을 받아요"}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="좋아요 알림"
        // 권한 차단 시엔 토글로 켤 수 없으므로 비활성화(설정에서 허용해야 함)
        disabled={busy || denied}
        onClick={() => (on ? disable.mutate() : enable.mutate())}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${
          on ? "bg-primary" : "bg-line"
        }`}
      >
        {/* 손잡이: 사방 2px(left/top-0.5) 여백, 켜질 때 오른쪽으로 1.25rem 이동 */}
        <span
          className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-bg shadow-sm transition-transform duration-200 ${
            on ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
