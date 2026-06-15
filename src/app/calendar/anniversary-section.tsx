"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Drawer } from "vaul";
import { holidayName } from "@/lib/holidays-kr";

type Anniversary = {
  id: number;
  title: string;
  date: string; // ISO 문자열
  yearly: boolean;
  author: { displayName: string | null; username: string } | null;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const DAY_MS = 86_400_000;
const QUERY_KEY = ["anniversaries"] as const;

async function fetchAnniversaries(): Promise<Anniversary[]> {
  const res = await fetch("/api/anniversaries");
  if (!res.ok) throw new Error("일정을 불러오지 못했습니다.");
  const data: { anniversaries: Anniversary[] } = await res.json();
  return data.anniversaries;
}

async function errorMessage(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  if (
    body !== null &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return "처리에 실패했습니다.";
}

// 저장된 날짜(UTC 자정)에서 yyyy-mm-dd(요일) 표기
function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}(${WEEKDAYS[d.getUTCDay()]})`;
}

// D-day: 매년 반복이면 다음 주기까지, 1회성이면 지난 경우 D+N
function formatDday(iso: string, yearly: boolean, todayMs: number): string {
  const d = new Date(iso);
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const today = new Date(todayMs);

  if (yearly) {
    let next = new Date(today.getFullYear(), month, day);
    if (next.getTime() < todayMs) {
      next = new Date(today.getFullYear() + 1, month, day);
    }
    const r = Math.round((next.getTime() - todayMs) / DAY_MS);
    return r === 0 ? "D-DAY" : `D-${r}`;
  }

  const target = new Date(d.getUTCFullYear(), month, day);
  const r = Math.round((target.getTime() - todayMs) / DAY_MS);
  if (r === 0) return "D-DAY";
  return r > 0 ? `D-${r}` : `D+${-r}`;
}

// UTC 자정으로 저장된 날짜에서 연/월/일 추출(타임존 시프트 방지)
function ymdFromIso(iso: string): { y: number; m: number; d: number } {
  const dt = new Date(iso);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

// 다음 발생 시각(로컬 자정 ms) — 매년 반복은 다음 주기, 1회성은 그 날짜. 정렬·필터용.
function nextOccurrenceMs(
  iso: string,
  yearly: boolean,
  todayMs: number
): number {
  const { y, m, d } = ymdFromIso(iso);
  if (yearly) {
    const ty = new Date(todayMs).getFullYear();
    let next = new Date(ty, m, d).getTime();
    if (next < todayMs) next = new Date(ty + 1, m, d).getTime();
    return next;
  }
  return new Date(y, m, d).getTime();
}

export function AnniversarySection() {
  const qc = useQueryClient();
  const [todayMs] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  });
  // 달력에 표시 중인 달 + 선택된 날짜(선택 시 그 날 일정만 리스트에 표시)
  const [view, setView] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [selected, setSelected] = useState<{
    y: number;
    m: number;
    d: number;
  } | null>(() => {
    // 기본 선택은 오늘 — 처음 열면 오늘 일정을 보여준다("전체 보기"로 다가오는 목록 전환)
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() };
  });

  const { data: items, isPending } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchAnniversaries,
  });

  // 폼 상태
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [yearly, setYearly] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  function openAdd() {
    setEditingId(null);
    setTitle("");
    // 달력에서 날짜를 선택해 둔 상태면 그 날짜를 기본값으로(한 날짜에 여러 일정 추가 편의)
    setDate(
      selected
        ? `${selected.y}-${String(selected.m + 1).padStart(2, "0")}-${String(
            selected.d
          ).padStart(2, "0")}`
        : ""
    );
    setYearly(true);
    setErr(null);
    setOpen(true);
  }

  function openEdit(a: Anniversary) {
    setEditingId(a.id);
    setTitle(a.title);
    setDate(a.date.slice(0, 10));
    setYearly(a.yearly);
    setErr(null);
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { title, date, yearly };
      const res =
        editingId === null
          ? await fetch("/api/anniversaries", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/anniversaries/${editingId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      if (!res.ok) throw new Error(await errorMessage(res));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setOpen(false);
    },
    onError: (e: unknown) => {
      setErr(e instanceof Error ? e.message : "저장에 실패했습니다.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (editingId === null) return;
      const res = await fetch(`/api/anniversaries/${editingId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await errorMessage(res));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setOpen(false);
    },
    onError: (e: unknown) => {
      setErr(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    },
  });

  const saving = saveMutation.isPending;
  const deleting = deleteMutation.isPending;
  const busy = saving || deleting;

  // ── 달력/리스트 파생값 ───────────────────────────────
  const td = new Date(todayMs);
  const list = items ?? [];

  // 표시 중인 달에 일정이 있는 날 → 날짜별 항목(마커 + 선택 보기). 매년 반복은
  // 매년 그 월/일에, 1회성은 해당 연·월에만(지난 것도 마커 유지).
  const monthItemsByDay = new Map<number, Anniversary[]>();
  for (const a of list) {
    const { y, m, d } = ymdFromIso(a.date);
    const inMonth = a.yearly ? m === view.m : y === view.y && m === view.m;
    if (inMonth) {
      const arr = monthItemsByDay.get(d) ?? [];
      arr.push(a);
      monthItemsByDay.set(d, arr);
    }
  }

  // 달력 셀: 앞 빈칸 + 1..말일 + 뒤 빈칸(주 단위 정렬)
  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // 리스트: 날짜 선택 시 그 날 일정(지난·매년 포함), 아니면 지난 1회성 제외 +
  // 매년 반복 포함 → 다가오는 순(D-day 오름차순).
  const listItems = selected
    ? list.filter((a) => {
        const { y, m, d } = ymdFromIso(a.date);
        return a.yearly
          ? m === selected.m && d === selected.d
          : y === selected.y && m === selected.m && d === selected.d;
      })
    : list
        .filter(
          (a) => a.yearly || nextOccurrenceMs(a.date, false, todayMs) >= todayMs
        )
        .sort(
          (a, b) =>
            nextOccurrenceMs(a.date, a.yearly, todayMs) -
            nextOccurrenceMs(b.date, b.yearly, todayMs)
        );

  function shiftMonth(delta: number) {
    setSelected(null);
    setView((v) => {
      const m = v.m + delta;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });
  }
  function pickDay(d: number) {
    setSelected((cur) =>
      cur && cur.y === view.y && cur.m === view.m && cur.d === d
        ? null
        : { y: view.y, m: view.m, d }
    );
  }

  // 선택한 날짜가 공휴일이면 이름(예: "추석") 표시
  const selectedHoliday = selected
    ? holidayName(selected.y, selected.m, selected.d)
    : null;

  return (
    <section >
      <div className="relative mb-8">
        <h2 className="pl-[0.3em] text-center text-2xl font-light tracking-[0.3em]">
          CALENDAR
        </h2>
        <button
          type="button"
          onClick={openAdd}
          aria-label="일정 추가"
          className="absolute right-0 top-1/2 -translate-y-1/2 p-1 transition-opacity hover:opacity-60"
        >
          {/* 갤러리 + 버튼과 동일한 plus 아이콘(mask) */}
          <span
            aria-hidden
            className="block size-6 bg-text"
            style={{
              maskImage: "url(/asset/images/contents/plus.svg)",
              WebkitMaskImage: "url(/asset/images/contents/plus.svg)",
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskPosition: "center",
              maskSize: "contain",
              WebkitMaskSize: "contain",
            }}
          />
        </button>
      </div>

      {/* 월간 달력 — 마커는 읽기 전용(추가는 상단 + 버튼). 날짜를 탭하면 그 날 일정만
          아래 리스트에 표시(지난 1회성도 달력에서 선택하면 보고 수정 가능). */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="이전 달"
            className="flex size-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg hover:text-text"
          >
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" aria-hidden className="size-[18px]">
              <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-sm font-light tracking-[0.15em] tabular-nums">
            {view.y}. {String(view.m + 1).padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="다음 달"
            className="flex size-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg hover:text-text"
          >
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" aria-hidden className="size-[18px]">
              <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((w, i) => (
            <span
              key={w}
              className={`py-1 text-[0.65rem] tracking-wide ${
                i === 0 ? "text-error" : "text-text-muted"
              }`}
            >
              {w}
            </span>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <span key={`e${i}`} className="aspect-square" />;
            const weekday = i % 7; // 0=일
            const isToday =
              view.y === td.getFullYear() &&
              view.m === td.getMonth() &&
              d === td.getDate();
            const isSelected =
              selected?.y === view.y &&
              selected?.m === view.m &&
              selected?.d === d;
            const has = monthItemsByDay.has(d);
            // 공휴일(빨간날) 또는 일요일이면 빨간 숫자
            const isRed = weekday === 0 || holidayName(view.y, view.m, d) !== null;
            return (
              <button
                key={d}
                type="button"
                onClick={() => pickDay(d)}
                className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-full text-sm transition-colors ${
                  isSelected
                    ? "bg-primary font-medium"
                    : isToday
                      ? "bg-line font-medium"
                      : ""
                }`}
              >
                <span
                  className={`tabular-nums ${
                    isSelected
                      ? "text-white"
                      : isRed
                        ? "text-error"
                        : "text-text"
                  }`}
                >
                  {d}
                </span>
                {has && (
                  <span
                    className={`absolute bottom-1 size-1 rounded-full ${
                      isSelected ? "bg-white" : "bg-primary"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs tracking-[0.15em] text-text-muted">
            {selected.m + 1}월 {selected.d}일
            {selectedHoliday ? (
              <span className="text-error"> · {selectedHoliday}</span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-xs tracking-[0.15em] text-text-muted transition-colors hover:text-text"
          >
            전체 보기
          </button>
        </div>
      )}

      {isPending ? (
        <p className="py-6 text-center text-sm text-text-muted">불러오는 중…</p>
      ) : listItems.length > 0 ? (
        <ul className="flex flex-col">
          {listItems.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => openEdit(a)}
                className="flex w-full items-center justify-between gap-3 border-b border-line py-5 text-left transition-colors hover:bg-bg"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xs tracking-[0.15em] text-text-muted">
                    {a.title}
                    {a.yearly ? " · 매년" : ""}
                    {a.author
                      ? ` · ${a.author.displayName ?? a.author.username}`
                      : ""}
                  </span>
                  <span className="text-sm font-light tracking-wide">
                    {formatDate(a.date)}
                  </span>
                </div>
                <span className="text-3xl font-light tabular-nums text-text">
                  {formatDday(a.date, a.yearly, todayMs)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-5 text-center text-sm text-text-muted">
          일정이 없습니다.
        </p>
      )}


      {/* 추가/수정 바텀시트 */}
      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay
            className="fixed inset-0 z-[60]"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex w-full max-w-md flex-col rounded-t-3xl border-t border-line bg-surface px-6 pb-[calc(1.5rem+var(--safe-bottom))] outline-none">
            <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-line" />
            <Drawer.Title className="pb-4 pt-4 text-sm tracking-[0.15em] text-text-muted">
              {editingId === null ? "일정 추가" : "일정 수정"}
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              일정 제목과 날짜를 입력합니다.
            </Drawer.Description>

            <div className="flex flex-col gap-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs tracking-[0.15em] text-text-muted">
                  제목
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  placeholder="예) 처음 만난 날"
                  className="w-full border-b border-line bg-transparent py-2 outline-none transition-colors focus:border-primary placeholder:text-text-muted"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs tracking-[0.15em] text-text-muted">
                  날짜
                </span>
                {/* 브라우저별 date UI 편차 대응: 커스텀 아이콘 + 빈값 placeholder */}
                <div className="relative w-full">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker?.();
                      } catch (err) {
                        console.debug("[일정] showPicker 예외:", err);
                      }
                    }}
                    className={`block w-full min-w-0 appearance-none border-b border-line bg-transparent py-2 pr-7 outline-none transition-colors [color-scheme:light] focus:border-primary [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-date-and-time-value]:text-left ${
                      date ? "" : "text-transparent"
                    }`}
                  />
                  {!date && (
                    <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-text-muted">
                      YYYY / MM / DD
                    </span>
                  )}
                  <svg
                    aria-hidden
                    width={18}
                    height={18}
                    viewBox="0 0 24 24"
                    fill="none"
                    className="pointer-events-none absolute right-0 top-1/2 size-[18px] -translate-y-1/2 text-text-muted"
                  >
                    <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M3 9.5H21M8 3V6M16 3V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
              </label>

              <button
                type="button"
                onClick={() => setYearly((v) => !v)}
                className="flex select-none items-center gap-2.5 text-sm tracking-wide text-text-muted"
              >
                <span
                  className={`relative inline-flex size-[18px] items-center justify-center rounded-md border transition-all ${
                    yearly ? "border-primary bg-primary" : "border-line bg-surface"
                  }`}
                >
                  <svg
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden
                    width={14}
                    height={14}
                    className={`size-3.5 shrink-0 text-white transition-opacity ${
                      yearly ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <path
                      d="M3 7.5L6 10.5L11 4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                매년 반복
              </button>

              <div className="mt-2 flex flex-wrap gap-3">
                {editingId !== null && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => deleteMutation.mutate()}
                    className="min-w-[8rem] flex-1 rounded-xl border border-error py-4 text-sm tracking-[0.25em] text-error transition-colors hover:bg-error/10 active:scale-[0.98] disabled:opacity-50"
                  >
                    {deleting ? "삭제 중…" : "삭제"}
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => saveMutation.mutate()}
                  className="min-w-[8rem] flex-1 rounded-xl bg-primary py-4 text-sm tracking-[0.25em] text-white transition-all duration-200 hover:bg-primary-strong active:scale-[0.98] disabled:opacity-50"
                >
                  {saving ? "저장 중…" : "SAVE"}
                </button>
              </div>

              {err && (
                <p className="text-center text-sm text-error" role="alert">
                  {err}
                </p>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </section>
  );
}
