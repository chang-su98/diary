import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToAll } from "@/lib/push";
import { ymdFromIso } from "@/lib/calendar-date";

// Vercel Cron 전용 라우트 — 매일 12:00 UTC(=21:00 KST)에 호출되어, "내일(KST)"에
// 해당하는 일정이 있으면 두 사용자 모두에게 하루 전 리마인더 푸시를 보낸다.
//
// 인가: Vercel Cron이 붙여주는 `Authorization: Bearer ${CRON_SECRET}` 검증(fail-closed).
//   시크릿 미설정/불일치면 아무것도 실행하지 않는다(외부에서 임의 호출 차단).
// 중복 실행 방어: 단일 키 throttle로 하루 1회만 발송한다. key 카디널리티가 1로 고정이라
//   notify_throttles 행이 무한 증가하지 않는다(날짜를 key에 넣지 않는 이유).

const REMIND_KEY = "anniv-remind:daily";
// cron 더블 인보크/재시도 방어 윈도우(20h). 하루 1회 실행 전제라 다음날 호출은 통과한다.
const REMIND_DEBOUNCE_MS = 20 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 내일(KST)의 달력 연/월/일(month 0-based). 서버 타임존과 무관하게 UTC+9로 계산한다.
// (일정은 DB에 UTC 자정으로 저장되고 getUTC* 로 "달력 날짜"를 추출하는 앱 규칙과 일치.)
function tomorrowKst(): { y: number; m: number; d: number } {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  const next = new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1)
  );
  return { y: next.getUTCFullYear(), m: next.getUTCMonth(), d: next.getUTCDate() };
}

// 발송권을 원자적으로 1회만 획득해 중복 실행을 차단한다(사진 업로드 throttle과 동일 패턴).
// 조건부 updateMany는 윈도우가 지난 단 한 번의 호출에만 count=1을 주고, 행이 없으면(최초)
// create의 unique(@id) 충돌로 단일 호출만 선점한다.
async function claimReminder(): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - REMIND_DEBOUNCE_MS);
  const { count } = await prisma.notifyThrottle.updateMany({
    where: { key: REMIND_KEY, lastNotifiedAt: { lt: cutoff } },
    data: { lastNotifiedAt: now },
  });
  if (count > 0) return true;
  try {
    await prisma.notifyThrottle.create({
      data: { key: REMIND_KEY, lastNotifiedAt: now },
    });
    return true;
  } catch {
    return false; // 윈도우 내 이미 발송됨(다른 호출이 선점)
  }
}

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization");
    // fail-closed: 시크릿이 없거나 일치하지 않으면 실행하지 않는다.
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    if (!(await claimReminder())) {
      return NextResponse.json({ ok: true, skipped: "already-sent" });
    }

    const t = tomorrowKst();
    const all = await prisma.anniversary.findMany({
      select: { title: true, date: true, yearly: true },
    });

    // 내일 "시작"하는 일정만 — 기간 일정도 시작 하루 전에만 알리고 중간 날짜는 제외한다.
    // 매년 반복은 월/일 일치, 1회성은 연·월·일 일치(지난 해의 1회성이 매년 울리지 않게).
    const due = all.filter((a) => {
      const s = ymdFromIso(a.date.toISOString());
      return a.yearly
        ? s.m === t.m && s.d === t.d
        : s.y === t.y && s.m === t.m && s.d === t.d;
    });

    if (due.length === 0) {
      return NextResponse.json({ ok: true, due: 0 });
    }

    // 제목은 사용자 편집값 → 페이로드 비대화 방지로 길이를 제한한다.
    const titles = due.map((a) => a.title);
    const body =
      due.length === 1
        ? `내일은 '${titles[0].slice(0, 40)}' 일정이에요`
        : `내일 일정 ${due.length}개 — ${titles
            .map((title) => title.slice(0, 20))
            .join(", ")
            .slice(0, 80)}`;

    // 두 사람 모두에게(베스트 에포트). cron이라 응답을 기다리는 사용자가 없어 직접 await.
    await sendPushToAll({ title: "Record", body, url: "/", tag: "anniv-remind" });

    return NextResponse.json({ ok: true, due: due.length });
  } catch (error) {
    console.error("[GET /api/cron/anniversary-reminder]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
