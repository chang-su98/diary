"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Drawer } from "vaul";
import { fetchTrip, type TripPlace } from "@/lib/calendar-api";
import { formatMdWeekday } from "@/lib/calendar-date";
import { nightsLabel, tripDayCount, tripDayIso } from "@/lib/trip-date";
import { DateField, PlusIcon, errorMessage } from "@/app/calendar/form-fields";

// 여행 계획 상세 — 기간에서 파생한 1일차~N일차에 장소(네이버 지도 링크)를 붙인다.

// 장소 이름으로 네이버 지도 검색 — 링크를 찾아 복사해 오는 용도.
function naverSearchUrl(name: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(name)}`;
}

export function TripDetailView({ id }: { id: number }) {
  const qc = useQueryClient();
  const router = useRouter();
  const queryKey = ["trips", id] as const;

  const { data: trip, isPending, isError } = useQuery({
    queryKey,
    queryFn: () => fetchTrip(id),
  });

  // ── 장소 추가/수정 폼 ────────────────────────────────
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [day, setDay] = useState(1);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [placeErr, setPlaceErr] = useState<string | null>(null);

  // ── 여행 수정 폼 ────────────────────────────────────
  const [tripOpen, setTripOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tripErr, setTripErr] = useState<string | null>(null);

  function openAddPlace(d: number) {
    setPlaceId(null);
    setDay(d);
    setName("");
    setUrl("");
    setPlaceErr(null);
    setPlaceOpen(true);
  }

  function openEditPlace(p: TripPlace) {
    setPlaceId(p.id);
    setDay(p.day);
    setName(p.name);
    setUrl(p.url ?? "");
    setPlaceErr(null);
    setPlaceOpen(true);
  }

  function openEditTrip() {
    if (!trip) return;
    setTitle(trip.title);
    setStartDate(trip.startDate.slice(0, 10));
    setEndDate(trip.endDate.slice(0, 10));
    setTripErr(null);
    setTripOpen(true);
  }

  const savePlace = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("장소 이름을 입력하세요.");
      const payload = { day, name: name.trim(), url: url.trim() || null };
      const res = await fetch(
        placeId === null
          ? `/api/trips/${id}/places`
          : `/api/trips/${id}/places/${placeId}`,
        {
          method: placeId === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error(await errorMessage(res));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setPlaceOpen(false);
    },
    onError: (e: unknown) => {
      setPlaceErr(e instanceof Error ? e.message : "저장에 실패했습니다.");
    },
  });

  const deletePlace = useMutation({
    mutationFn: async () => {
      if (placeId === null) return;
      const res = await fetch(`/api/trips/${id}/places/${placeId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await errorMessage(res));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setPlaceOpen(false);
    },
    onError: (e: unknown) => {
      setPlaceErr(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    },
  });

  const saveTrip = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("제목을 입력하세요.");
      if (!startDate) throw new Error("시작일을 입력하세요.");
      const res = await fetch(`/api/trips/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startDate,
          endDate: endDate || startDate,
        }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["trips"] });
      setTripOpen(false);
    },
    onError: (e: unknown) => {
      setTripErr(e instanceof Error ? e.message : "저장에 실패했습니다.");
    },
  });

  const deleteTrip = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/trips/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      router.push("/calendar");
    },
    onError: (e: unknown) => {
      setTripErr(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    },
  });

  const shell =
    "mx-auto flex min-h-dvh w-full max-w-md flex-col px-8 pt-[calc(2rem+var(--safe-top))] pb-[calc(4.5rem+var(--safe-bottom))]";

  if (isPending) {
    return (
      <main className={shell}>
        <p className="py-10 text-center text-sm text-text-muted">불러오는 중…</p>
      </main>
    );
  }
  if (isError || !trip) {
    return (
      <main className={shell}>
        <p className="py-10 text-center text-sm text-text-muted">
          여행 계획을 불러오지 못했습니다.
        </p>
        <Link
          href="/calendar"
          className="mx-auto text-xs tracking-[0.15em] text-text-muted underline"
        >
          목록으로
        </Link>
      </main>
    );
  }

  const dayCount = tripDayCount(trip.startDate, trip.endDate);
  // 일차별 장소 묶음 — 응답이 이미 day·createdAt 순이라 순서 그대로 담는다.
  const byDay = new Map<number, TripPlace[]>();
  for (const p of trip.places) {
    const bucket = byDay.get(p.day);
    if (bucket) bucket.push(p);
    else byDay.set(p.day, [p]);
  }

  return (
    <main className={shell}>
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/calendar"
          aria-label="목록으로"
          className="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg hover:text-text"
        >
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" aria-hidden className="size-5">
            <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center text-lg font-light tracking-[0.1em]">
          {trip.title}
        </h1>
        <button
          type="button"
          onClick={openEditTrip}
          className="shrink-0 text-xs tracking-[0.15em] text-text-muted transition-colors hover:text-text"
        >
          수정
        </button>
      </div>

      <p className="mb-8 text-center text-xs tracking-[0.15em] text-text-muted">
        {trip.startDate.slice(0, 10)} ~ {trip.endDate.slice(0, 10)} ·{" "}
        {nightsLabel(trip.startDate, trip.endDate)}
      </p>

      <div className="flex flex-col gap-7">
        {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => {
          const places = byDay.get(d) ?? [];
          return (
            <section key={d}>
              <div className="mb-1 flex items-center justify-between border-b border-line pb-1.5">
                <span className="text-xs tracking-[0.15em] text-text-muted">
                  {d}일차 · {formatMdWeekday(tripDayIso(trip.startDate, d))}
                </span>
                <button
                  type="button"
                  onClick={() => openAddPlace(d)}
                  aria-label={`${d}일차에 장소 추가`}
                  className="p-1 transition-opacity hover:opacity-60"
                >
                  <PlusIcon className="size-4" />
                </button>
              </div>

              {places.length === 0 ? (
                <p className="py-4 text-center text-xs text-text-muted">
                  아직 담은 곳이 없습니다.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {places.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 border-b border-line/60 py-3"
                    >
                      {p.url ? (
                        // 링크가 있으면 행 전체가 네이버 지도로 이동(새 탭)
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left transition-opacity hover:opacity-60"
                        >
                          <span className="truncate text-sm font-light tracking-wide">
                            {p.name}
                          </span>
                          <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[0.6rem] tracking-[0.1em] text-text-muted">
                            지도
                          </span>
                        </a>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-sm font-light tracking-wide text-text-muted">
                          {p.name}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditPlace(p)}
                        aria-label={`${p.name} 수정`}
                        className="shrink-0 p-1 text-text-muted transition-colors hover:text-text"
                      >
                        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" aria-hidden className="size-4">
                          <path d="M4 20H8L18.5 9.5C19.6 8.4 19.6 6.6 18.5 5.5C17.4 4.4 15.6 4.4 14.5 5.5L4 16V20Z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {/* 장소 추가/수정 바텀시트 */}
      <Drawer.Root open={placeOpen} onOpenChange={setPlaceOpen}>
        <Drawer.Portal>
          <Drawer.Overlay
            className="fixed inset-0 z-[60]"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex w-full max-w-md flex-col rounded-t-3xl border-t border-line bg-surface px-6 pb-[calc(1.5rem+var(--safe-bottom))] outline-none">
            <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-line" />
            <Drawer.Title className="pb-4 pt-4 text-sm tracking-[0.15em] text-text-muted">
              {placeId === null ? "장소 추가" : "장소 수정"}
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              일차와 장소 이름, 네이버 지도 링크를 입력합니다.
            </Drawer.Description>

            <div className="flex flex-col gap-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs tracking-[0.15em] text-text-muted">일차</span>
                <select
                  value={day}
                  onChange={(e) => setDay(Number(e.target.value))}
                  className="w-full appearance-none border-b border-line bg-transparent py-2 outline-none transition-colors focus:border-primary"
                >
                  {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}일차 · {formatMdWeekday(tripDayIso(trip.startDate, d))}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs tracking-[0.15em] text-text-muted">장소</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  placeholder="예) 흑돼지 맛집"
                  className="w-full border-b border-line bg-transparent py-2 outline-none transition-colors focus:border-primary placeholder:text-text-muted"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="flex items-center justify-between text-xs tracking-[0.15em] text-text-muted">
                  네이버 지도 링크 (선택)
                  {name.trim() && (
                    // 링크를 아직 모를 때 — 네이버 지도에서 검색해 공유 링크를 복사해 온다
                    <a
                      href={naverSearchUrl(name.trim())}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline transition-colors hover:text-text"
                    >
                      지도에서 찾기
                    </a>
                  )}
                </span>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  inputMode="url"
                  maxLength={500}
                  placeholder="https://naver.me/..."
                  className="w-full border-b border-line bg-transparent py-2 outline-none transition-colors focus:border-primary placeholder:text-text-muted"
                />
              </label>

              <div className="mt-2 flex flex-wrap gap-3">
                {placeId !== null && (
                  <button
                    type="button"
                    disabled={savePlace.isPending || deletePlace.isPending}
                    onClick={() => deletePlace.mutate()}
                    className="min-w-[8rem] flex-1 rounded-xl border border-error py-4 text-sm tracking-[0.25em] text-error transition-colors hover:bg-error/10 active:scale-[0.98] disabled:opacity-50"
                  >
                    {deletePlace.isPending ? "삭제 중…" : "삭제"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={savePlace.isPending || deletePlace.isPending}
                  onClick={() => savePlace.mutate()}
                  className="min-w-[8rem] flex-1 rounded-xl bg-primary py-4 text-sm tracking-[0.25em] text-white transition-all duration-200 hover:bg-primary-strong active:scale-[0.98] disabled:opacity-50"
                >
                  {savePlace.isPending ? "저장 중…" : "SAVE"}
                </button>
              </div>

              {placeErr && (
                <p className="text-center text-sm text-error" role="alert">
                  {placeErr}
                </p>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* 여행 수정/삭제 바텀시트 */}
      <Drawer.Root open={tripOpen} onOpenChange={setTripOpen}>
        <Drawer.Portal>
          <Drawer.Overlay
            className="fixed inset-0 z-[60]"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex w-full max-w-md flex-col rounded-t-3xl border-t border-line bg-surface px-6 pb-[calc(1.5rem+var(--safe-bottom))] outline-none">
            <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-line" />
            <Drawer.Title className="pb-4 pt-4 text-sm tracking-[0.15em] text-text-muted">
              여행 계획 수정
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              여행 제목과 기간을 수정합니다.
            </Drawer.Description>

            <div className="flex flex-col gap-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs tracking-[0.15em] text-text-muted">제목</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  className="w-full border-b border-line bg-transparent py-2 outline-none transition-colors focus:border-primary placeholder:text-text-muted"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs tracking-[0.15em] text-text-muted">기간</span>
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

              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={saveTrip.isPending || deleteTrip.isPending}
                  onClick={() => deleteTrip.mutate()}
                  className="min-w-[8rem] flex-1 rounded-xl border border-error py-4 text-sm tracking-[0.25em] text-error transition-colors hover:bg-error/10 active:scale-[0.98] disabled:opacity-50"
                >
                  {deleteTrip.isPending ? "삭제 중…" : "삭제"}
                </button>
                <button
                  type="button"
                  disabled={saveTrip.isPending || deleteTrip.isPending}
                  onClick={() => saveTrip.mutate()}
                  className="min-w-[8rem] flex-1 rounded-xl bg-primary py-4 text-sm tracking-[0.25em] text-white transition-all duration-200 hover:bg-primary-strong active:scale-[0.98] disabled:opacity-50"
                >
                  {saveTrip.isPending ? "저장 중…" : "SAVE"}
                </button>
              </div>

              {tripErr && (
                <p className="text-center text-sm text-error" role="alert">
                  {tripErr}
                </p>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </main>
  );
}
