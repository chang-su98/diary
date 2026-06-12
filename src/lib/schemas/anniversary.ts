import { z } from "zod";
import { strictDateString } from "@/lib/schemas/common";

// 기념일 생성 — 모든 필드 필수
export const anniversaryCreateSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력하세요.").max(100),
  date: strictDateString,
  yearly: z.boolean(),
});

// 기념일 수정 — 부분 수정(있는 필드만 갱신)
export const anniversaryUpdateSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력하세요.").max(100).optional(),
  date: strictDateString.optional(),
  yearly: z.boolean().optional(),
});

export type AnniversaryCreateInput = z.infer<typeof anniversaryCreateSchema>;
export type AnniversaryUpdateInput = z.infer<typeof anniversaryUpdateSchema>;
