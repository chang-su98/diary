import { z } from "zod";
import { IMAGE_DATA_URL_RE, strictDateString } from "@/lib/schemas/common";

// 리사이즈된 아바타 data URL 길이 상한(약 220KB 이미지 수준)
export const MAX_AVATAR_CHARS = 300_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 빈 문자열은 null(값 비움)로 정규화
const emptyToNull = (v: unknown) => (v === "" ? null : v);

// 프로필 부분 수정(PATCH) — 모든 필드 선택. 없으면 미수정, null/""이면 값 비움.
export const profileUpdateSchema = z.object({
  displayName: z
    .preprocess(emptyToNull, z.string().max(50).nullable())
    .optional(),
  email: z
    .preprocess(emptyToNull, z.string().max(255).regex(EMAIL_RE).nullable())
    .optional(),
  birthday: z
    .preprocess(emptyToNull, strictDateString.nullable())
    .optional(),
  avatar: z
    .preprocess(
      emptyToNull,
      z.string().max(MAX_AVATAR_CHARS).regex(IMAGE_DATA_URL_RE).nullable()
    )
    .optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
