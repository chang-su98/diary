"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Drawer } from "vaul";
import { fetchTrips } from "@/lib/calendar-api";
import { DAY_MS, formatYmdWeekday, localMs, WEEKDAYS } from "@/lib/calendar-date";
import { nightsLabel } from "@/lib/trip-date";
import { DateField, PlusIcon, errorMessage } from "./form-fields";

// 디데이 슬라이드의 "여행 계획" 목록.
// 여기서는 여행 자체(제목·기간)만 만들고, 일차별 장소는 상세(/calendar/trip/[id])에서 다룬다.

const QUERY_KEY = ["trips"] as const;

// 기간 표기 — "2026-10-03(금) ~ 10.05(일)"(같은 해면 종료는 월-일만)
function formatRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (s.getTime() === e.getTime()) return formatYmdWeekday(startIso);
  const endStr =
    s.getUTCFullYear() === e.getUTCFullYear()
      ? `${String(e.getUTCMonth() + 1).padStart(2, "0")}-${String(
          e.getUTCDate()
        ).padStart(2, "0")}(${WEEKDAYS[e.getUTCDay()]})`
      : formatYmdWeekday(endIso);
  return `${formatYmdWeekday(startIso)} ~ ${endStr}`;
}

// D-day — 여행 중이면 "N일차", 지났으면 D+N, 아니면 시작일까지 D-N
function tripDday(startIso: string, endIso: string, todayMs: number): string {
  const start = localMs(startIso);
  const end = localMs(endIso);
  if (todayMs >= start && todayMs <= end) {
    return `${Math.round((todayMs - start) / DAY_MS) + 1}일차`;
  }
  const r = Math.round((start - todayMs) / DAY_MS);
  return r > 0 ? `D-${r}` : `D+${-r}`;
}

export function TripList() {
  const qc = useQueryClient();
  // 오늘 0시(로컬)을 마운트 시 1회 고정 — 렌더 중 시간 읽기(purity 위반) 회피
  const [todayMs] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  });

  const { data, isPending, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchTrips,
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function openAdd() {
    setTitle("");
    setStartDate("");
    setEndDate("");
    setErr(null);
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      // 클라이언트 1차 검증 — 서버(Zod)에서도 막지만 즉시 피드백용
      if (!title.trim()) throw new Error("제목을 입력하세요.");
      if (!startDate) throw new Error("시작일을 입력하세요.");
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 종료일을 비우면 당일치기로 본다
        body: JSON.stringify({
          title: title.trim(),
          startDate,
          endDate: endDate || startDate,
        }),
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

  const trips = data ?? [];

  return (
    <section className="pt-8">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs tracking-[0.15em] text-text-muted">여행 계획</span>
        <button
          type="button"
          onClick={openAdd}
          aria-label="여행 계획 추가"
          className="p-1 transition-opacity hover:opacity-60"
        >
          <PlusIcon className="size-5" />
        </button>
      </div>

      {isPending ? (
        <p className="py-5 text-center text-sm text-text-muted">불러오는 중…</p>
      ) : isError ? (
        <p className="py-5 text-center text-sm text-text-muted">
          여행 계획을 불러오지 못했습니다.
        </p>
      ) : trips.length === 0 ? (
        <p className="py-5 text-center text-sm text-text-muted">
          아직 여행 계획이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col">
          {trips.map((t) => {
            const dday = tripDday(t.startDate, t.endDate, todayMs);
            return (
              <li key={t.id}>
                <Link
                  href={`/calendar/trip/${t.id}`}
                  className="flex w-full items-center justify-between gap-3 border-b border-line py-4 text-left transition-colors hover:bg-bg"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-xs tracking-[0.15em] text-text-muted">
                      {t.title} · {nightsLabel(t.startDate, t.endDate)}
                    </span>
                    <span className="text-sm font-light tracking-wide">
                      {formatRange(t.startDate, t.endDate)}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 tabular-nums text-text ${
                      dday.endsWith("일차")
                        ? "text-base font-normal"
                        : "text-2xl font-normal"
                    }`}
                  >
                    {dday}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* 여행 추가 바텀시트 */}
      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay
            className="fixed inset-0 z-[60]"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex w-full max-w-md flex-col rounded-t-3xl border-t border-line bg-surface px-6 pb-[calc(1.5rem+var(--safe-bottom))] outline-none">
            <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-line" />
            <Drawer.Title className="pb-4 pt-4 text-sm tracking-[0.15em] text-text-muted">
              여행 계획 추가
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              여행 제목과 기간을 입력합니다. 기간에 맞춰 일차가 자동으로 만들어집니다.
            </Drawer.Description>

            <div className="flex flex-col gap-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs tracking-[0.15em] text-text-muted">제목</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  placeholder="예) 제주도 여행"
                  className="w-full border-b border-line bg-transparent py-2 outline-none transition-colors focus:border-primary placeholder:text-text-muted"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs tracking-[0.15em] text-text-muted">
                  기간 (일차는 날짜에 맞춰 자동 생성)
                </span>
                <div className="flex items-center gap-2">
                  <DateField value={startDate} onChange={setStartDate} />
                  <span className="shrink-0 text-text-muted">~</span>
                  <DateField
                    value={endDate}
                    onChange={setEndDate}
                    min={startDate || undefined}
                  />
                </div>
              </label>

              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="mt-2 rounded-xl bg-primary py-4 text-sm tracking-[0.25em] text-white transition-all duration-200 hover:bg-primary-strong active:scale-[0.98] disabled:opacity-50"
              >
                {saveMutation.isPending ? "저장 중…" : "SAVE"}
              </button>

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
