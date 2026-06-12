import { z } from "zod";
import { IMAGE_DATA_URL_RE } from "@/lib/schemas/common";

// 리사이즈된 사진 data URL 길이 상한(약 2MB 이미지 수준). MediumText(16MB) 내 안전 여유.
export const MAX_PHOTO_CHARS = 3_000_000;

// 디코드 후 실제 바이트 상한(약 2.25MB). base64 문자 수 상한만으론 디코드 크기를
// 직접 보장하지 못하므로, 서버에서 디코드한 버퍼 길이를 한 번 더 검증한다.
export const MAX_PHOTO_BYTES = 2_250_000;

// 사진 업로드 — 원본(data) data URL + 표시 비율(width/height) 필수
export const photoCreateSchema = z.object({
  data: z.string().max(MAX_PHOTO_CHARS).regex(IMAGE_DATA_URL_RE),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
});

export type PhotoCreateInput = z.infer<typeof photoCreateSchema>;

// 사진 일괄 삭제 — 선택한 사진 id 배열
export const photoDeleteSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1, "삭제할 사진을 선택하세요.")
    .max(100, "한 번에 삭제할 수 있는 사진은 100장까지입니다."),
});
