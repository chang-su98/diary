import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SINCE } from "@/lib/relationship";
import { DayCounter } from "@/app/calendar/day-counter";
import { NextAnniversary } from "@/app/calendar/next-anniversary";
import { HomeCalendar } from "@/app/_components/home-calendar";
import { CoupleLine } from "@/app/_components/couple-line";
import { Reveal } from "@/app/_components/reveal";

const pad = (n: number) => String(n).padStart(2, "0");
const rawUrl = (id: number) => `/api/photos/${id}/raw`;
// 생일(DateTime?) → "M월 D일". 날짜만 의미 있으므로 UTC 기준 표기(타임존 이동 방지).
const fmtBirthday = (d: Date | null) =>
  d ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일` : null;

// 인스타그램 아이콘(feather). stroke=currentColor로 부모 색을 따른다.
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
    </svg>
  );
}

// 메인 — 청첩장 톤: 히어로 사진 → 두 사람 이름 → 처음 만난 날(월 달력) → 함께한 일수 → 최근 사진.
export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login"); // proxy로도 보호되지만 방어적

  // 두 사람 이름 + 최근 사진(히어로 1 + 썸네일 3)을 병렬 조회
  const [users, photos] = await Promise.all([
    prisma.user.findMany({
      orderBy: { id: "asc" },
      select: {
        displayName: true,
        username: true,
        avatar: true,
        birthday: true,
      },
    }),
    prisma.photo.findMany({
      orderBy: { id: "desc" },
      take: 6,
      select: { id: true },
    }),
  ]);

  // 표시 이름 + username(=인스타 아이디) + 프로필. 폐쇄형 2인 앱.
  const people = users.length
    ? users.map((u) => ({
        name: u.displayName ?? u.username,
        username: u.username,
        avatar: u.avatar,
        birthday: u.birthday,
      }))
    : [
        {
          name: session.username,
          username: session.username,
          avatar: null,
          birthday: null,
        },
      ];
  const recent = photos; // 최신 6장 — 정사각 3×2 그리드

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col divide-y divide-line px-6 pt-[calc(2rem+var(--safe-top))] pb-[calc(4.5rem+var(--safe-bottom))] [&>section]:py-7 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
      {/* 히어로 — 라인 드로잉 + 진입 fade-in */}
      <Reveal>
        <div className="flex justify-center">
          <CoupleLine className="h-44 w-auto text-text" />
        </div>
      </Reveal>

      {/* 두 사람 이름 + 처음 만난 날(디데이 페이지와 동일한 누적일 카운터 디자인) */}
      <Reveal className="space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-extralight tracking-[0.18em] text-text">
            {people.map((p, i) => (
              <span key={p.username}>
                {i > 0 && (
                  <span className="font-thin text-text-muted"> &amp; </span>
                )}
                {p.name}
              </span>
            ))}
          </h1>
        </div>

        <div className="flex flex-col items-center gap-2">
          <span className="text-[0.7rem] tracking-[0.3em] text-text-muted">
            SINCE {SINCE.year}.{pad(SINCE.month)}.{pad(SINCE.day)}
          </span>
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-4xl font-thin text-text-muted">+</span>
            <DayCounter className="inline-block min-w-[2ch] text-center text-7xl font-extralight leading-none tabular-nums" />
            <span className="self-end pb-1 text-xl font-light text-text-muted">
              일
            </span>
          </div>
          <NextAnniversary className="text-[0.7rem] tracking-[0.3em] text-text-muted" />
        </div>
      </Reveal>

      {/* CALENDAR — 이번 달 일정 미리보기(읽기 전용). 탭하면 캘린더 페이지로 이동. */}
      <Reveal>
        <p className="mb-4 text-center text-sm tracking-[0.3em] text-text">
          CALENDAR
        </p>
        <HomeCalendar />
      </Reveal>

      {/* ABOUT US — 두 사람 프로필 카드(아바타·이름·생일·인스타) */}
      <Reveal>
        <p className="mb-6 text-center text-sm tracking-[0.3em] text-text">
          ABOUT US
        </p>
        <div className="flex justify-center gap-10">
          {people.map((p) => (
            <div
              key={p.username}
              className="flex flex-1 flex-col items-center gap-2 text-center"
            >
              <span className="size-16 overflow-hidden rounded-full border border-line bg-bg">
                {p.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL 이미지
                  <img
                    src={p.avatar}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-lg font-light text-text-muted">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              <p className="text-sm tracking-wide text-text">{p.name}</p>
              {fmtBirthday(p.birthday) && (
                <p className="text-[0.7rem] tracking-wide text-text-muted">
                  {fmtBirthday(p.birthday)}
                </p>
              )}
              <a
                href={`https://instagram.com/${encodeURIComponent(p.username)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 flex items-center gap-1 text-[0.7rem] tracking-wide text-text-muted transition-opacity hover:opacity-60"
              >
                <InstagramIcon className="size-3.5" />@{p.username}
              </a>
            </div>
          ))}
        </div>
      </Reveal>

      {/* 최근 사진 — PHOTO 헤더(왼쪽) + MORE(갤러리로, 오른쪽) + 정사각 3×2 */}
      {recent.length > 0 && (
        <Reveal>
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-sm tracking-[0.3em] text-text">PHOTO</p>
            <Link
              href="/gallery"
              className="flex items-center gap-0.5 text-[0.65rem] tracking-[0.28em] text-text-muted transition-opacity hover:opacity-60"
            >
              MORE
              {/* chevron-right.svg를 mask로 사용 → 테마색(bg-text-muted)으로 채색 */}
              <span
                aria-hidden
                className="block size-3 bg-text-muted"
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
              <Link
                key={t.id}
                href="/gallery"
                className="aspect-square overflow-hidden rounded-sm border border-line transition-opacity hover:opacity-90 active:opacity-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 라우트 서빙 이미지 */}
                <img
                  src={rawUrl(t.id)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              </Link>
            ))}
          </div>
        </Reveal>
      )}
    </main>
  );
}
