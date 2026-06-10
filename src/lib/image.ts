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
