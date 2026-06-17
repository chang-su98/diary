// Diary PWA 미니 서비스워커 (온라인 전제)
// - 설치 가능(installability) 요건인 fetch 핸들러만 유지
// - 인증된 페이지(예: 보호된 홈)를 캐시하지 않는다 → 캐시를 통한 정보 노출 방지

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // 과거 버전이 캐시해 둔 항목(인증 페이지 포함)을 모두 제거
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // 네비게이션은 네트워크 전용(캐시 사용 안 함). 온라인 전제라 오프라인 폴백 미제공.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request));
  }
});

// 푸시 수신 → 알림 표시. 페이로드는 서버(web-push)가 보낸 JSON.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Record";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      // 같은 tag면 알림이 쌓이지 않고 갱신된다(예: 같은 사진의 좋아요)
      tag: data.tag,
      data: { url: data.url || "/" },
    })
  );
});

// 알림 클릭 → 해당 URL의 기존 창을 포커스하거나 새로 연다.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            // 현재 경로가 목표와 다를 때만 이동(같은 페이지 불필요한 리로드 방지)
            try {
              if (new URL(client.url).pathname !== url) client.navigate(url);
            } catch {
              client.navigate(url);
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});
