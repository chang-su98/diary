import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";

// 한국천문연구원 특일정보 — getRestDeInfo(법정공휴일 + 대체공휴일 반환).
// 키(DATA_GO_KR_KEY)는 서버에서만 쓰고, 클라이언트엔 'YYYY-MM-DD → 공휴일명' 맵만 내려준다.
const BASE =
  "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

type HolidayMap = Record<string, string>;

// 외부 응답 항목 — as 단언 대신 Zod로 검증(rules/api.md)
const restItem = z.object({
  locdate: z.union([z.number(), z.string()]),
  dateName: z.string(),
  isHoliday: z.string().optional(),
});

// 서버 메모리 캐시(연 단위). Next fetch Data Cache는 URL(=serviceKey 포함)을 캐시 키/
// 저장에 남기므로 사용하지 않고, 여기서 year만 키로 캐싱한다(키가 어디에도 잔존 안 함).
const YEAR_TTL = 30 * 24 * 60 * 60 * 1000; // 정상: 30일
const EMPTY_TTL = 24 * 60 * 60 * 1000; // 빈 결과(일시 실패·미고시 연도): 1일만
const cache = new Map<number, { exp: number; map: HolidayMap }>();

// 해당 연도 공휴일 맵을 외부 API에서 만든다. solYear만으로 연 전체가 1회에 온다.
// 실패(키 오류·네트워크·파싱) 시 빈 맵.
async function buildYearMap(key: string, year: number): Promise<HolidayMap> {
  const url =
    `${BASE}?serviceKey=${encodeURIComponent(key)}` +
    `&solYear=${year}&numOfRows=100&_type=json`;
  let json: unknown;
  try {
    // Next Data Cache에 URL(키)이 남지 않도록 no-store. 캐싱은 위 메모리 캐시가 담당.
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`[GET /api/holidays] 외부 응답 실패: ${res.status} (${year})`);
      return {};
    }
    json = await res.json();
  } catch (error) {
    // undici 에러의 cause/스택에 요청 URL(키 평문)이 담길 수 있어 메시지만, 키는 마스킹.
    // 원본·URL 인코딩본 둘 다 치환(키에 +,/,= 가 있으면 인코딩 형태로 들어올 수 있음).
    const msg = error instanceof Error ? error.message : String(error);
    const masked = msg
      .split(key)
      .join("***")
      .split(encodeURIComponent(key))
      .join("***");
    console.warn(`[GET /api/holidays] 요청 실패 (${year}):`, masked);
    return {};
  }

  const raw = (json as { response?: { body?: { items?: { item?: unknown } } } })
    ?.response?.body?.items?.item;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const map: HolidayMap = {};
  for (const it of list) {
    const parsed = restItem.safeParse(it);
    if (!parsed.success) continue;
    const { locdate, dateName, isHoliday } = parsed.data;
    if (isHoliday && isHoliday !== "Y") continue; // 공휴일만(방어적)
    const s = String(locdate); // YYYYMMDD
    if (s.length !== 8) continue;
    const date = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    const cur = map[date];
    if (!cur) map[date] = dateName;
    else if (!cur.split(", ").includes(dateName)) map[date] = `${cur}, ${dateName}`;
  }
  return map;
}

async function getYearMap(key: string, year: number): Promise<HolidayMap> {
  const hit = cache.get(year);
  if (hit && hit.exp > Date.now()) return hit.map;
  const map = await buildYearMap(key, year);
  const ttl = Object.keys(map).length > 0 ? YEAR_TTL : EMPTY_TTL;
  cache.set(year, { exp: Date.now() + ttl, map });
  return map;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const year = Number(new URL(req.url).searchParams.get("year"));
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const key = process.env.DATA_GO_KR_KEY;
    if (!key) {
      console.warn("[GET /api/holidays] DATA_GO_KR_KEY 미설정 — 빈 맵 반환");
      return NextResponse.json(
        { holidays: {} },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const holidays = await getYearMap(key, year);
    // 공휴일은 앱에서 변경되지 않는 정적 데이터 → 브라우저에 길게 캐시(연도별 URL).
    // (앱 내 변경/무효화 대상이 아니므로 HTTP 캐시가 invalidate를 막을 일이 없음)
    return NextResponse.json(
      { holidays },
      { headers: { "Cache-Control": "private, max-age=2592000" } } // 30일
    );
  } catch (error) {
    console.error("[GET /api/holidays]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
