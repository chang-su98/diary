import { z } from "zod";

// 날짜는 YYYY-MM-DD 포맷만 허용(타임존 모호성 차단). 저장은 UTC 자정.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 기념일 생성 — 모든 필드 필수
export const anniversaryCreateSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력하세요.").max(100),
  date: z
    .string()
    .regex(DATE_RE, "유효한 날짜가 아닙니다.")
    .refine(
      (v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()),
      "유효한 날짜가 아닙니다."
    ),
  yearly: z.boolean(),
});

// 기념일 수정 — 부분 수정(있는 필드만 갱신)
export const anniversaryUpdateSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력하세요.").max(100).optional(),
  date: z
    .string()
    .regex(DATE_RE, "유효한 날짜가 아닙니다.")
    .refine(
      (v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()),
      "유효한 날짜가 아닙니다."
    )
    .optional(),
  yearly: z.boolean().optional(),
});

export type AnniversaryCreateInput = z.infer<typeof anniversaryCreateSchema>;
export type AnniversaryUpdateInput = z.infer<typeof anniversaryUpdateSchema>;
