import { useQuery } from "@tanstack/react-query";

// 'YYYY-MM-DD' → 공휴일명(여러 개면 쉼표). /api/holidays(천문연 특일정보 프록시)에서 받는다.
export type HolidayMap = Record<string, string>;

async function fetchHolidays(year: number): Promise<HolidayMap> {
  const res = await fetch(`/api/holidays?year=${year}`);
  if (!res.ok) return {};
  const json: { holidays?: HolidayMap } = await res.json();
  return json.holidays ?? {};
}

/**
 * 해당 연도의 공휴일 맵을 가져온다(연 단위 캐시). 미로딩/실패 시 빈 맵.
 * 공휴일은 거의 안 바뀌므로 staleTime을 길게 둔다.
 */
export function useHolidays(year: number): HolidayMap {
  const { data } = useQuery({
    queryKey: ["holidays", year],
    queryFn: () => fetchHolidays(year),
    staleTime: 1000 * 60 * 60 * 24, // 1일
    gcTime: 1000 * 60 * 60 * 24,
  });
  return data ?? {};
}

// 맵 조회용 키. month는 0-based(달력 상태와 동일).
export function holidayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
