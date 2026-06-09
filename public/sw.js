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
