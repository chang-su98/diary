// 선택한 사진을 기기에 저장한다. 플랫폼별로 경로가 다르다:
// - iOS: Web Share API(파일) → 네이티브 시트의 "이미지 저장"이 사진 앱에 바로 저장.
// - Android: 공유 시트에 "사진첩/갤러리에 저장" 액션이 없고 앱으로 공유만 가능하므로
//   곧바로 직접 다운로드한다. 파일은 Downloads 폴더에 저장되고 갤러리(삼성 갤러리 등)의
//   'Download' 앨범에 색인되어 나타난다.
// - 그 외/데스크톱: Web Share 가능하면 시도, 아니면 직접 다운로드.
// 웹앱은 기기 갤러리(DCIM)에 소리 없이 쓸 수 없어, 위 경로가 사실상 최선이다.

// 그리드·모달과 동일한 원본 서빙 URL(브라우저 캐시 공유)
const rawUrl = (id: number) => `/api/photos/${id}/raw`;

// navigator.share(files)는 lib.dom 버전에 따라 타입이 없을 수 있어 교차 타입으로 좁힌다
// (use-standalone.ts의 IosNavigator와 동일 패턴 — any 회피).
type ShareNavigator = Navigator & {
  canShare?: (data?: { files?: File[] }) => boolean;
  share?: (data?: { files?: File[] }) => Promise<void>;
};

function extFromType(type: string): string {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("heic") || type.includes("heif")) return "heic";
  return "jpg";
}

async function fetchAsFile(id: number): Promise<File> {
  const res = await fetch(rawUrl(id));
  if (!res.ok) throw new Error("사진을 불러오지 못했어요.");
  const blob = await res.blob();
  const type = blob.type || "image/jpeg";
  return new File([blob], `record-${id}.${extFromType(type)}`, { type });
}

// 동시 fetch 동시성 상한 — 전량 동시 다운로드 시 모바일 메모리 급증을 막는다.
const FETCH_CONCURRENCY = 4;

// id 목록을 동시성 제한 워커 풀로 File 배열에 받는다(원래 순서 보존).
async function fetchFiles(ids: number[]): Promise<File[]> {
  const out = new Array<File>(ids.length);
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const i = next++;
      out[i] = await fetchAsFile(ids[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, ids.length) }, worker)
  );
  return out;
}

export type SaveOutcome = "shared" | "downloaded" | "cancelled";

/**
 * 선택한 사진 id들을 기기에 저장한다.
 * - "shared": Web Share 시트로 저장(사용자가 갤러리 등 선택)
 * - "downloaded": 직접 다운로드 폴백 실행
 * - "cancelled": 공유 시트를 사용자가 닫음
 */
export async function savePhotosToDevice(ids: number[]): Promise<SaveOutcome> {
  // 동시성 제한으로 받아 메모리 스파이크 완화(공유는 전체 File을 함께 넘겨야 함).
  // 참고(N-2): fetch가 길어지면(캐시 미스) iOS의 user activation이 만료돼 nav.share가
  // 거부될 수 있다. 그리드·모달에서 이미 본 사진은 캐시 적중이라 보통 즉시 resolve된다.
  const files = await fetchFiles(ids);

  // Android는 공유 시트에 갤러리 저장 액션이 없어 Web Share를 건너뛰고 바로 다운로드한다.
  const isAndroid = /Android/i.test(navigator.userAgent);

  // 1) Web Share API(파일) — 네이티브 "사진/갤러리에 저장" 시트 (Android 제외)
  // iOS 홈화면 PWA(standalone)에서는 navigator.share는 동작하는데 canShare가
  // undefined인 경우가 있다. canShare로만 막으면 iOS가 다운로드 폴백으로 빠져
  // 파일앱에 한 장만 저장된다 → canShare는 함수일 때만 확인하고, 없으면 일단 시도.
  const nav = navigator as ShareNavigator;
  if (!isAndroid && typeof nav.share === "function") {
    const canShareFiles =
      typeof nav.canShare === "function" ? nav.canShare({ files }) : true;
    if (canShareFiles) {
      try {
        await nav.share({ files });
        return "shared";
      } catch (error) {
        // 사용자가 시트를 닫음 → 실패가 아니라 취소
        if (error instanceof DOMException && error.name === "AbortError")
          return "cancelled";
        // 그 외(NotAllowedError 등)는 아래 다운로드 폴백으로 진행
        console.warn("[gallery] Web Share 실패 → 다운로드 폴백:", error);
      }
    }
  }

  // 2) 직접 다운로드 — Android 기본 경로이자 그 외 플랫폼의 폴백.
  //    Downloads 폴더로 저장 → 갤러리 'Download' 앨범에 노출. 모바일은 보통 제스처당
  //    1건만 허용하므로 각 클릭 사이에 짧은 지연을 둬 다중 다운로드 차단을 완화한다.
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 즉시 revoke하면 일부 브라우저가 다운로드를 취소 → 지연 해제
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    if (i < files.length - 1)
      await new Promise((resolve) => window.setTimeout(resolve, 300));
  }
  return "downloaded";
}
