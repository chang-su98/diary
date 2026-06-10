"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Drawer } from "vaul";

type Anniversary = {
  id: number;
  title: string;
  date: string; // ISO 문자열
  yearly: boolean;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const DAY_MS = 86_400_000;
const QUERY_KEY = ["anniversaries"] as const;

async function fetchAnniversaries(): Promise<Anniversary[]> {
  const res = await fetch("/api/anniversaries");
  if (!res.ok) throw new Error("기념일을 불러오지 못했습니다.");
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

export function AnniversarySection() {
  const qc = useQueryClient();
  const [todayMs] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
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
    setDate("");
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

  return (
    <section className="pt-8">
      <h2 className="mb-1 text-xs tracking-[0.2em] text-text-muted">
        우리들의 기념일
      </h2>

      {isPending ? (
        <p className="py-6 text-center text-sm text-text-muted">불러오는 중…</p>
      ) : items && items.length > 0 ? (
        <ul className="flex flex-col">
          {items.map((a) => (
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
          등록된 기념일이 없습니다.
        </p>
      )}

      <button
        type="button"
        onClick={openAdd}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-4 text-sm tracking-wide text-text-muted transition-colors hover:border-text hover:text-text active:scale-[0.99]"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          width={18}
          height={18}
          className="size-[18px] shrink-0"
        >
          <path
            d="M12 5V19M5 12H19"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
        기념일 추가하기
      </button>

      {/* 추가/수정 바텀시트 */}
      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay
            className="fixed inset-0 z-[60]"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex w-full max-w-md flex-col rounded-t-3xl border-t border-line bg-surface px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] outline-none">
            <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-line" />
            <Drawer.Title className="pb-4 pt-4 text-sm tracking-[0.15em] text-text-muted">
              {editingId === null ? "기념일 추가" : "기념일 수정"}
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              기념일 제목과 날짜를 입력합니다.
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
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border-b border-line bg-transparent py-2 outline-none transition-colors [color-scheme:light] focus:border-primary"
                />
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

              <button
                type="button"
                disabled={busy}
                onClick={() => saveMutation.mutate()}
                className="mt-2 w-full rounded-xl bg-primary py-4 text-sm tracking-[0.25em] text-white transition-all duration-200 hover:bg-primary-strong active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? "저장 중…" : "SAVE"}
              </button>

              {editingId !== null && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => deleteMutation.mutate()}
                  className="text-center text-sm tracking-wide text-error transition-colors hover:underline disabled:opacity-50"
                >
                  {deleting ? "삭제 중…" : "삭제"}
                </button>
              )}

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
