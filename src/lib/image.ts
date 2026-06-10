// canvas가 출력 가능한 래스터 포맷. 그 외(gif·heic 등) 입력은 jpeg로 변환.
const OUTPUT_TYPES = ["image/jpeg", "image/png", "image/webp"];

// 파일을 정사각형으로 cover-crop 리사이즈해 data URL로 변환 (클라이언트 전용).
// png/webp/jpeg 입력은 포맷 보존, 그 외는 jpeg로 변환.
export async function fileToResizedDataURL(
  file: File,
  size = 256,
  quality = 0.85
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context를 사용할 수 없습니다.");

    // cover: 짧은 변 기준으로 꽉 채우고 가운데 정렬
    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);

    const outType = OUTPUT_TYPES.includes(file.type) ? file.type : "image/jpeg";
    return canvas.toDataURL(outType, quality);
  } finally {
    bitmap.close();
  }
}

// 비율을 유지한 채 긴 변을 maxEdge 이하로 축소해 data URL로 변환 (클라이언트 전용).
// 갤러리 메이슨리용 — 정사각 크롭이 아니라 원본 비율을 보존한다.
// 표시 비율(레이아웃 시프트 방지)을 위해 결과 width/height도 함께 반환.
export async function fileToScaledImage(
  file: File,
  maxEdge = 1280,
  quality = 0.8
): Promise<{ dataUrl: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context를 사용할 수 없습니다.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const outType = OUTPUT_TYPES.includes(file.type) ? file.type : "image/jpeg";
    return { dataUrl: canvas.toDataURL(outType, quality), width, height };
  } finally {
    bitmap.close();
  }
}
