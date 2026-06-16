import type { CalendarAnniversary, FixedMember } from "@/lib/fixed-anniversaries";
import {
  anniversariesResponseSchema,
  membersResponseSchema,
} from "@/lib/schemas/calendar";

// 캘린더 클라이언트 fetch — 응답을 Zod로 검증해 깨진 데이터가 날짜 계산(NaN 등)으로
// 전파되는 것을 막는다. 여러 컴포넌트(BirthdayList·YearlyAnniversaries·
// AnniversarySection)가 공유하던 중복 fetch/타입을 단일 출처로 통합.

export async function fetchMembers(): Promise<FixedMember[]> {
  const res = await fetch("/api/members");
  if (!res.ok) throw new Error("회원 정보를 불러오지 못했습니다.");
  const parsed = membersResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    console.error("[GET /api/members] 응답 스키마 불일치:", parsed.error.issues);
    throw new Error("회원 정보를 처리할 수 없습니다.");
  }
  return parsed.data.members;
}

export async function fetchAnniversaries(): Promise<CalendarAnniversary[]> {
  const res = await fetch("/api/anniversaries");
  if (!res.ok) throw new Error("일정을 불러오지 못했습니다.");
  const parsed = anniversariesResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    console.error(
      "[GET /api/anniversaries] 응답 스키마 불일치:",
      parsed.error.issues
    );
    throw new Error("일정을 처리할 수 없습니다.");
  }
  return parsed.data.anniversaries;
}
