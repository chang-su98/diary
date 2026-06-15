import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";

// 한국천문연구원 특일정보 — getRestDeInfo(법정공휴일 + 대체공휴일 반환).
// 키(DATA_GO_KR_KEY)는 서버에서만 사용하고, 클라이언트엔 'YYYY-MM-DD → 공휴일명' 맵만 내려준다.
const BASE =
  "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

type RestItem = { locdate: number | string; dateName: string; isHoliday?: string };

// 공휴일은 연 단위로 거의 안 바뀌므로 길게 캐시(30일).
const REVALIDATE_SEC = 60 * 60 * 24 * 30;

// 한 달치 특일정보를 받아 [locdate, dateName] 목록으로 반환(실패 시 빈 배열).
async function fetchMonth(
  key: string,
  year: number,
  month: number
): Promise<RestItem[]> {
  const url =
    `${BASE}?serviceKey=${encodeURIComponent(key)}` +
    `&solYear=${year}&solMonth=${String(month).padStart(2, "0")}` +
    `&numOfRows=50&_type=json`;
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SEC } });
    if (!res.ok) {
      console.warn(`[GET /api/holidays] 외부 응답 실패: ${res.status} (${year}-${month})`);
      return [];
    }
    const json: unknown = await res.json();
    const items = (
      json as { response?: { body?: { items?: { item?: unknown } } } }
    )?.response?.body?.items?.item;
    if (Array.isArray(items)) return items as RestItem[];
    if (items && typeof items === "object") return [items as RestItem];
    return [];
  } catch (error) {
    // 키 오류·JSON 파싱 실패(에러는 XML로 옴) 등 — 해당 달만 건너뛴다.
    console.warn(`[GET /api/holidays] 파싱 실패 (${year}-${month}):`, error);
    return [];
  }
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
      return NextResponse.json({ holidays: {} });
    }

    // 월별 12회 호출(병렬). getRestDeInfo는 solMonth가 필요해 달 단위로 받는다.
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const perMonth = await Promise.all(
      months.map((mm) => fetchMonth(key, year, mm))
    );

    const holidays: Record<string, string> = {};
    for (const items of perMonth) {
      for (const it of items) {
        const s = String(it.locdate); // YYYYMMDD
        if (s.length !== 8) continue;
        const date = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
        holidays[date] = holidays[date]
          ? `${holidays[date]}, ${it.dateName}`
          : it.dateName;
      }
    }

    return NextResponse.json({ holidays });
  } catch (error) {
    console.error("[GET /api/holidays]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
