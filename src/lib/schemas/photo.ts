import { z } from "zod";

// 리사이즈된 사진 data URL 길이 상한(약 2MB 이미지 수준). MediumText(16MB) 내 안전 여유.
export const MAX_PHOTO_CHARS = 3_000_000;

// 클라이언트(lib/image.ts)는 jpeg/png/webp data URL을 생성한다.
// 래스터 포맷만 허용 — svg 등 스크립트 실행 가능 포맷 차단.
const PHOTO_DATA_URL_RE =
  /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

// 사진 업로드 — data URL + 표시 비율(width/height) 필수
export const photoCreateSchema = z.object({
  data: z.string().max(MAX_PHOTO_CHARS).regex(PHOTO_DATA_URL_RE),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
});

export type PhotoCreateInput = z.infer<typeof photoCreateSchema>;
