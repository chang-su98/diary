import { z } from "zod";

// 리사이즈된 아바타 data URL 길이 상한(약 220KB 이미지 수준)
export const MAX_AVATAR_CHARS = 300_000;

// 클라이언트(lib/image.ts)는 jpeg/png/webp data URL을 생성한다(jpg는 image/jpeg).
// 래스터 포맷만 허용 — svg 등 스크립트 실행 가능 포맷 차단.
// prefix + base64 본문(빈 값·비-base64 문자)까지 검증.
const AVATAR_DATA_URL_RE =
  /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

// 생일은 YYYY-MM-DD 포맷만 허용(타임존 모호성 차단). 저장은 UTC 자정으로 통일.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    .preprocess(
      emptyToNull,
      z
        .string()
        .regex(DATE_RE, "유효한 날짜가 아닙니다.")
        .refine(
          (v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()),
          "유효한 날짜가 아닙니다."
        )
        .nullable()
    )
    .optional(),
  avatar: z
    .preprocess(
      emptyToNull,
      z.string().max(MAX_AVATAR_CHARS).regex(AVATAR_DATA_URL_RE).nullable()
    )
    .optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
