import { z } from "zod";
import { strictDateString } from "@/lib/schemas/common";
import { TRIP_MAX_DAYS, tripDayCount } from "@/lib/trip-date";

// 여행 기간 검증 — 종료일은 시작일 이후, 기간은 TRIP_MAX_DAYS 이내.
// 부분 수정(PATCH)에서 한쪽만 오면 라우트가 기존 값과 병합해 재검증한다.
function refineTripRange(
  val: { startDate?: string; endDate?: string },
  ctx: z.RefinementCtx
) {
  if (val.startDate === undefined || val.endDate === undefined) return;
  if (val.endDate < val.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "종료일은 시작일보다 빠를 수 없습니다.",
    });
    return;
  }
  if (tripDayCount(val.startDate, val.endDate) > TRIP_MAX_DAYS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: `여행 기간은 최대 ${TRIP_MAX_DAYS}일까지입니다.`,
    });
  }
}

// 외부 링크(네이버 지도 등) — https만 허용.
// javascript:/data: 등 스킴을 통한 링크 주입을 스키마 단계에서 차단한다.
const httpsUrl = z
  .string()
  .trim()
  .max(500, "링크가 너무 깁니다.")
  .refine((v) => {
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "https:// 로 시작하는 링크만 넣을 수 있습니다.");

// 여행 생성
export const tripCreateSchema = z
  .object({
    title: z.string().trim().min(1, "제목을 입력하세요.").max(100),
    startDate: strictDateString,
    endDate: strictDateString,
  })
  .superRefine(refineTripRange);

// 여행 수정 — 부분 수정(있는 필드만 갱신)
export const tripUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "제목을 입력하세요.").max(100).optional(),
    startDate: strictDateString.optional(),
    endDate: strictDateString.optional(),
  })
  .superRefine(refineTripRange);

// 장소 추가 — day는 1-based 일차. 실제 일차 수 초과 여부는 라우트에서 여행 기간과 대조.
export const tripPlaceCreateSchema = z.object({
  day: z.number().int().min(1).max(TRIP_MAX_DAYS),
  name: z.string().trim().min(1, "장소 이름을 입력하세요.").max(100),
  url: httpsUrl.nullish(), // 링크 없이 이름만 적어둘 수도 있다
});

// 장소 수정 — 부분 수정. url을 null로 보내면 링크 제거.
export const tripPlaceUpdateSchema = z.object({
  day: z.number().int().min(1).max(TRIP_MAX_DAYS).optional(),
  name: z.string().trim().min(1, "장소 이름을 입력하세요.").max(100).optional(),
  url: httpsUrl.nullish(),
});

export type TripCreateInput = z.infer<typeof tripCreateSchema>;
export type TripUpdateInput = z.infer<typeof tripUpdateSchema>;
export type TripPlaceCreateInput = z.infer<typeof tripPlaceCreateSchema>;
export type TripPlaceUpdateInput = z.infer<typeof tripPlaceUpdateSchema>;
