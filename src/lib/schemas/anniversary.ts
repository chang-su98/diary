import { z } from "zod";
import { strictDateString } from "@/lib/schemas/common";

// 기간(범위) 일정 검증 — 종료일은 시작일 이후여야 하고, 매년 반복은 기간 미지원(1회성만).
function refineRange(
  val: { date?: string; endDate?: string | null; yearly?: boolean },
  ctx: z.RefinementCtx
) {
  if (val.endDate == null) return;
  if (val.yearly === true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "매년 반복 일정은 기간을 설정할 수 없습니다.",
    });
  }
  if (val.date !== undefined && val.endDate < val.date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "종료일은 시작일보다 빠를 수 없습니다.",
    });
  }
}

// 기념일 생성
export const anniversaryCreateSchema = z
  .object({
    title: z.string().trim().min(1, "제목을 입력하세요.").max(100),
    date: strictDateString,
    endDate: strictDateString.nullish(), // 기간 종료일(선택). 없으면 단일일.
    yearly: z.boolean(),
  })
  .superRefine(refineRange);

// 기념일 수정 — 부분 수정(있는 필드만 갱신). endDate는 null로 보내면 단일일로 초기화.
export const anniversaryUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "제목을 입력하세요.").max(100).optional(),
    date: strictDateString.optional(),
    endDate: strictDateString.nullish(),
    yearly: z.boolean().optional(),
  })
  .superRefine(refineRange);

export type AnniversaryCreateInput = z.infer<typeof anniversaryCreateSchema>;
export type AnniversaryUpdateInput = z.infer<typeof anniversaryUpdateSchema>;
