import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SINCE, daysSince } from "@/lib/relationship";
import { MeetCalendar } from "@/app/_components/meet-calendar";

const pad = (n: number) => String(n).padStart(2, "0");
const rawUrl = (id: number) => `/api/photos/${id}/raw`;

// 메인 — 청첩장 톤: 히어로 사진 → 두 사람 이름 → 처음 만난 날(월 달력) → 함께한 일수 → 최근 사진.
export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login"); // proxy로도 보호되지만 방어적

  // 두 사람 이름 + 최근 사진(히어로 1 + 썸네일 3)을 병렬 조회
  const [users, photos] = await Promise.all([
    prisma.user.findMany({
      orderBy: { id: "asc" },
      select: { displayName: true, username: true },
    }),
    prisma.photo.findMany({
      orderBy: { id: "desc" },
      take: 6,
      select: { id: true },
    }),
  ]);

  const names = users.length
    ? users.map((u) => u.displayName ?? u.username)
    : [session.username];
  const hero = photos[0] ?? null;
  const recent = photos; // 최신 6장 — 정사각 3×2 그리드
  const days = daysSince();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col divide-y divide-line px-6 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(4.5rem+env(safe-area-inset-bottom))] [&>section]:py-7 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
      {/* 히어로 — 최근 사진 1장 */}
      {hero && (
        <section>
          <div className="h-40 w-full overflow-hidden rounded border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- 라우트 서빙 이미지 */}
            <img
              src={rawUrl(hero.id)}
              alt=""
              className="size-full object-cover"
            />
          </div>
        </section>
      )}

      {/* 두 사람 이름 + 처음 만난 날 — 한 묶음(둘 사이는 구분선 없이 간격만) */}
      <section className="space-y-7">
        <div className="text-center">
          <p className="mb-5 text-[0.7rem] tracking-[0.32em] text-text-muted">
            SINCE {SINCE.year} · {pad(SINCE.month)} · {pad(SINCE.day)}
          </p>
          <h1 className="text-2xl font-extralight tracking-[0.18em] text-text">
            {names.map((n, i) => (
              <span key={i}>
                {i > 0 && (
                  <span className="font-thin text-text-muted"> &amp; </span>
                )}
                {n}
              </span>
            ))}
          </h1>
        </div>

        <div>
          <p className="mb-2 text-center text-[0.55rem] tracking-[0.3em] text-text-muted">
            처음 만난 날
          </p>
          <MeetCalendar />
          <p className="mt-4 text-center text-[0.7rem] tracking-[0.26em] text-text-muted">
            함께한 지 {days}일
          </p>
        </div>
      </section>

      {/* 최근 사진 — RECENT 헤더(왼쪽) + more(갤러리로, 오른쪽) + 정사각 3×2 */}
      {recent.length > 0 && (
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-sm tracking-[0.3em] text-text">RECENT</p>
            <Link
              href="/gallery"
              className="flex items-center gap-0.5 text-xs tracking-[0.28em] text-text-muted transition-opacity hover:opacity-60"
            >
              MORE
              {/* chevron-right.svg를 mask로 사용 → 테마색(bg-text-muted)으로 채색 */}
              <span
                aria-hidden
                className="block size-3.5 bg-text-muted"
                style={{
                  maskImage: "url(/asset/images/contents/chevron-right.svg)",
                  WebkitMaskImage: "url(/asset/images/contents/chevron-right.svg)",
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                  maskPosition: "center",
                  WebkitMaskPosition: "center",
                  maskSize: "contain",
                  WebkitMaskSize: "contain",
                }}
              />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {recent.map((t) => (
              <div
                key={t.id}
                className="aspect-square overflow-hidden rounded-sm border border-line"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 라우트 서빙 이미지 */}
                <img
                  src={rawUrl(t.id)}
                  alt=""
                  className="size-full object-cover"
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
