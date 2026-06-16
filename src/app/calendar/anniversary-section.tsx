"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Drawer } from "vaul";
import { useHolidays, holidayKey } from "@/lib/use-holidays";
import { useCalendarStore } from "@/lib/calendar-store";
import { fetchAnniversaries, fetchMembers } from "@/lib/calendar-api";
import {
  buildFixedAnniversaries,
  type CalendarAnniversary,
} from "@/lib/fixed-anniversaries";
import {
  DAY_MS,
  WEEKDAYS,
  formatYmdWeekday,
  nextYearlyOccurrence,
} from "@/lib/calendar-date";

// 달력이 다루는 일정 형태 — DB 일정 + 고정(생일·처음 만난 날) 가상 일정 공용.
// virtual=true인 항목은 읽기 전용(수정·삭제 불가).
type Anniversary = CalendarAnniversary;

const QUERY_KEY = ["anniversaries"] as const;

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

// D-day: 매년 반복이면 다음 주기까지, 1회성이면 지난 경우 D+N
function formatDday(iso: string, yearly: boolean, todayMs: number): string {
  const d = new Date(iso);
  const month = d.getUTCMonth();
  const day = d.getUTCDate();

  if (yearly) {
    const next = nextYearlyOccurrence(month, day, todayMs).getTime();
    const r = Math.round((next - todayMs) / DAY_MS);
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

// 표시 중인 달(y,m)에 발생하는 일정인지 — 매년 반복은 월 일치, 1회성은 그 연·월,
// 기간은 달과 겹치면 포함. (날짜 미선택 시 그달 일정 목록 필터용)
function occursInMonth(
  iso: string,
  endIso: string | null,
  yearly: boolean,
  y: number,
  m: number
): boolean {
  const s = ymdFromIso(iso);
  if (yearly) return s.m === m;
  if (!endIso) return s.y === y && s.m === m;
  const monthStart = new Date(y, m, 1).getTime();
  const monthEnd = new Date(y, m + 1, 0).getTime();
  return localMs(iso) <= monthEnd && localMs(endIso) >= monthStart;
}

// 그 달 안에서의 정렬용 일자 — 기간이 이전 달부터 이어진 경우엔 1일로.
function dayInMonth(iso: string, y: number, m: number): number {
  const s = ymdFromIso(iso);
  if (s.m === m && s.y === y) return s.d; // 그달 시작(단일/기간)
  if (s.m === m) return s.d; // 매년 반복(연도는 달라도 월 일치)
  return 1; // 이전 달부터 이어진 기간
}

// 로컬 자정 ms — UTC 저장 날짜의 연/월/일을 로컬 날짜로 취급(비교·계산용)
function localMs(iso: string): number {
  const { y, m, d } = ymdFromIso(iso);
  return new Date(y, m, d).getTime();
}

// 기간 일정의 "N박 N+1일" 라벨. 단일일/역전이면 null.
function rangeLabel(a: Anniversary): string | null {
  if (!a.endDate) return null;
  const nights = Math.round((localMs(a.endDate) - localMs(a.date)) / DAY_MS);
  return nights > 0 ? `${nights}박 ${nights + 1}일` : null;
}

// 리스트 날짜 표기 — 기간이면 "시작 ~ 종료"(같은 해면 종료는 월-일만)
function formatRange(a: Anniversary): string {
  if (!a.endDate) return formatYmdWeekday(a.date);
  const s = ymdFromIso(a.date);
  const e = ymdFromIso(a.endDate);
  const endStr =
    s.y === e.y
      ? `${String(e.m + 1).padStart(2, "0")}-${String(e.d).padStart(2, "0")}(${WEEKDAYS[new Date(a.endDate).getUTCDay()]})`
      : formatYmdWeekday(a.endDate);
  return `${formatYmdWeekday(a.date)} ~ ${endStr}`;
}

// D-day 표기 — 기간 중(오늘이 시작~종료 사이)이면 "진행 중", 아니면 시작일 기준 D-day
function ddayDisplay(a: Anniversary, todayMs: number): string {
  if (a.endDate && todayMs >= localMs(a.date) && todayMs <= localMs(a.endDate)) {
    return "진행 중";
  }
  return formatDday(a.date, a.yearly, todayMs);
}

// 커스텀 날짜 입력 — 브라우저별 date UI 편차 대응(빈값 placeholder + 아이콘)
function DateField({
  value,
  onChange,
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
}) {
  return (
    <div className="relative w-full min-w-0">
      <input
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch (err) {
            console.debug("[일정] showPicker 예외:", err);
          }
        }}
        className={`block w-full min-w-0 appearance-none border-b border-line bg-transparent py-2 pr-7 outline-none transition-colors [color-scheme:light] focus:border-primary [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-date-and-time-value]:text-left ${
          value ? "" : "text-transparent"
        }`}
      />
      {!value && (
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
  );
}

// 체크박스 한 줄(박스 + 라벨) — 연일/매년 반복 공용
function CheckButton({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex select-none items-center gap-2.5 text-sm tracking-wide text-text-muted"
    >
      <span
        className={`relative inline-flex size-[18px] items-center justify-center rounded-md border transition-all ${
          checked ? "border-primary bg-primary" : "border-line bg-surface"
        }`}
      >
        <svg
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden
          width={14}
          height={14}
          className={`size-3.5 shrink-0 text-white transition-opacity ${
            checked ? "opacity-100" : "opacity-0"
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
      {label}
    </button>
  );
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
  // 달 이동 방향(1=다음, -1=이전) — 날짜 그리드 슬라이드 애니메이션 방향
  const [dir, setDir] = useState(1);
  // 연/월 선택 팝오버("year" | "month" | null)
  const [picker, setPicker] = useState<"year" | "month" | null>(null);
  const yearListRef = useRef<HTMLDivElement>(null);
  // 날짜 그리드 좌우 스와이프(달 이동)용 — 시작 좌표 + 이번 제스처가 스와이프였는지
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const didSwipe = useRef(false);
  // 연도 팝오버가 열리면 현재 연도를 목록 가운데로 스크롤
  useEffect(() => {
    if (picker !== "year") return;
    yearListRef.current
      ?.querySelector('[data-current="true"]')
      ?.scrollIntoView({ block: "center" });
  }, [picker]);
  // 기본은 선택 없음(전체 보기) — 처음 열면 다가오는 일정 목록을 보여준다(D-day 중심).
  // 날짜를 탭하면 그날 일정 보기로 들어가고, 오늘은 달력에 회색으로 표시된다.
  const [selected, setSelected] = useState<{
    y: number;
    m: number;
    d: number;
  } | null>(null);
  // 슬라이드1(생일·기념일)에서 항목을 누르면 그 날짜로 점프 — 스토어 nonce 변화에
  // 반응해 표시 달(view)과 선택 날짜(selected)를 갱신. setState는 구독 콜백 내에서만
  // 호출(렌더/이펙트 본문이 아님)이라 컴파일러 set-state-in-effect 규칙에 걸리지 않는다.
  useEffect(
    () =>
      useCalendarStore.subscribe((s, prev) => {
        if (s.nonce === prev.nonce || s.target === null) return;
        const { y, m, d } = s.target;
        setDir(1); // 점프는 앞으로 넘기는 애니메이션으로 통일(방향은 표시상 의미 없음)
        setView({ y, m });
        setSelected({ y, m, d });
      }),
    []
  );

  const { data: items, isPending } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchAnniversaries,
  });
  // 생일 표시용 회원 정보(BirthdayList와 ["members"] 캐시 공유 → 중복 fetch 없음)
  const { data: members } = useQuery({
    queryKey: ["members"],
    queryFn: fetchMembers,
  });

  // 공휴일(천문연 API) — 표시 중인 연도 + 선택 날짜 연도(다를 수 있음). 연도별 캐시.
  const viewHolidays = useHolidays(view.y);
  const selectedHolidays = useHolidays(selected ? selected.y : view.y);

  // 폼 상태
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState(""); // 기간 종료일(비우면 단일일)
  const [isRange, setIsRange] = useState(false); // 연일(기간) 일정 여부
  const [yearly, setYearly] = useState(false);
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
    setEndDate("");
    setIsRange(false);
    setYearly(false);
    setErr(null);
    setOpen(true);
  }

  function openEdit(a: Anniversary) {
    setEditingId(a.id);
    setTitle(a.title);
    setDate(a.date.slice(0, 10));
    setEndDate(a.endDate ? a.endDate.slice(0, 10) : "");
    setIsRange(a.endDate !== null);
    setYearly(a.yearly);
    setErr(null);
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      // 클라이언트 1차 검증 — 서버(Zod)에서도 막지만 즉시 피드백 + 잘못된 값 전송 방지
      if (!title.trim()) throw new Error("제목을 입력하세요.");
      if (!date) throw new Error("날짜를 입력하세요.");
      if (isRange && !endDate) throw new Error("종료일을 입력하세요.");
      // 연일이면 기간(endDate) + 매년 반복 false, 아니면 단일일.
      const payload = {
        title: title.trim(),
        date,
        endDate: isRange ? endDate || null : null,
        yearly: isRange ? false : yearly,
      };
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
  // DB 일정 + 고정(생일·처음 만난 날) 가상 일정. 가상 항목은 매년 반복 읽기 전용으로
  // 그리드 마커·리스트에 같이 표시된다(클릭해도 수정 폼은 열리지 않음).
  const list = [...(items ?? []), ...buildFixedAnniversaries(members ?? [])];

  // 표시 중인 달에 일정이 있는 날 → 날짜별 항목(마커 + 선택 보기). 매년 반복은
  // 매년 그 월/일에, 1회성은 해당 연·월에만(지난 것도 마커 유지).
  const monthItemsByDay = new Map<number, Anniversary[]>();
  const markDay = (day: number, a: Anniversary) => {
    const arr = monthItemsByDay.get(day) ?? [];
    arr.push(a);
    monthItemsByDay.set(day, arr);
  };
  for (const a of list) {
    const s = ymdFromIso(a.date);
    if (a.yearly) {
      if (s.m === view.m) markDay(s.d, a); // 매년 반복은 매년 그 월/일
    } else if (!a.endDate) {
      if (s.y === view.y && s.m === view.m) markDay(s.d, a);
    } else {
      // 기간(1회성) — 시작~종료의 각 날짜 중 표시 중인 달에 속하는 날 마킹.
      // ms 누적 대신 setDate로 순회(DST 보정) + 비정상 데이터 폭주 가드(~5년).
      const end = localMs(a.endDate);
      const dt = new Date(localMs(a.date));
      let guard = 0;
      while (dt.getTime() <= end && guard < 2000) {
        if (dt.getFullYear() === view.y && dt.getMonth() === view.m)
          markDay(dt.getDate(), a);
        dt.setDate(dt.getDate() + 1);
        guard++;
      }
    }
  }

  // 달력 셀: 앞 빈칸 + 1..말일 + 뒤 빈칸(주 단위 정렬)
  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // 리스트: 날짜 선택 시 그 날 일정(지난·매년 포함), 아니면 표시 중인 달의 일정만
  // → 그달 안의 일자 오름차순. (달을 넘기면 그 달 일정으로 갱신)
  const listItems = selected
    ? list.filter((a) => {
        const s = ymdFromIso(a.date);
        if (a.yearly) return s.m === selected.m && s.d === selected.d;
        const selMs = new Date(selected.y, selected.m, selected.d).getTime();
        const startMs = localMs(a.date);
        const endMs = a.endDate ? localMs(a.endDate) : startMs;
        return selMs >= startMs && selMs <= endMs; // 기간이면 그 사이 날짜도 포함
      })
    : list
        .filter((a) => occursInMonth(a.date, a.endDate, a.yearly, view.y, view.m))
        .sort(
          (a, b) =>
            dayInMonth(a.date, view.y, view.m) -
            dayInMonth(b.date, view.y, view.m)
        );

  function shiftMonth(delta: number) {
    // 달을 옮겨도 선택한 날짜는 유지(다른 달을 봐도 선택 해제 안 됨)
    setDir(delta);
    setView((v) => {
      const m = v.m + delta;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });
  }
  // ── 날짜 그리드 좌우 스와이프 → 달 이동 ───────────────
  // 부모(CalendarSwiper)도 가로 scroll-snap이라, 그리드에는 touch-action: pan-y를
  // 줘서 가로 제스처가 페이지 슬라이드로 전파되지 않게 막는다(달 이동 우선).
  function onGridTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    didSwipe.current = false;
  }
  function onGridTouchMove(e: React.TouchEvent) {
    const start = touchStart.current;
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // 가로로 충분히 움직였으면 스와이프로 간주 → 날짜 탭(click) 무시용 플래그
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) didSwipe.current = true;
  }
  function onGridTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // 가로 우세 + 임계치 이상일 때만 달 이동(왼쪽으로 밀면 다음 달)
    if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      // touchend 핸들러 안에서 곧바로 remount하면 일부 모바일이 제스처 진행 중으로
      // 보고 슬라이드 애니메이션 첫 프레임을 스킵한다 → 다음 프레임으로 미뤄 재생 보장
      const delta = dx < 0 ? 1 : -1;
      requestAnimationFrame(() => shiftMonth(delta));
    }
  }

  function pickDay(d: number) {
    if (didSwipe.current) return; // 스와이프로 끝난 제스처면 날짜 선택 무시
    setSelected((cur) =>
      cur && cur.y === view.y && cur.m === view.m && cur.d === d
        ? null
        : { y: view.y, m: view.m, d }
    );
  }
  // 연/월 드롭다운에서 특정 달로 점프(슬라이드 방향은 이동 방향대로). 선택 날짜는 유지.
  function jumpTo(y: number, m: number) {
    const oldIdx = view.y * 12 + view.m;
    const newIdx = y * 12 + m;
    if (newIdx === oldIdx) return;
    setDir(newIdx > oldIdx ? 1 : -1);
    setView({ y, m });
  }
  // "오늘" — 오늘 달의 일정 목록으로 이동(날짜 선택 없이 → 오늘은 달력에 회색으로 표시).
  function goToToday() {
    const y = td.getFullYear();
    const m = td.getMonth();
    setDir(y * 12 + m >= view.y * 12 + view.m ? 1 : -1);
    setView({ y, m });
    setSelected(null);
  }

  // 선택한 날짜가 공휴일이면 이름(예: "추석") 표시
  const selectedHoliday = selected
    ? selectedHolidays[holidayKey(selected.y, selected.m, selected.d)] ?? null
    : null;
  // 선택한 날짜가 오늘인지 — 헤더에 (TODAY) 표시
  const isSelectedToday =
    selected !== null &&
    selected.y === td.getFullYear() &&
    selected.m === td.getMonth() &&
    selected.d === td.getDate();
  // "오늘" 버튼 노출 — 타이틀이 "N월 일정"인 상태(날짜 미선택)에서, 오늘 달이 아닐 때만.
  // (날짜 선택 중엔 옆의 "N월 일정" 버튼으로 목록 복귀, 이미 오늘 달이면 돌아갈 곳 없음)
  const viewingTodayMonth =
    view.y === td.getFullYear() && view.m === td.getMonth();
  const showTodayButton = selected === null && !viewingTodayMonth;
  // 리스트 영역 페이드용 key — 선택(날짜/전체)이 바뀌면 재마운트되어 페이드 인 재생
  const listKey = selected
    ? `${selected.y}-${selected.m}-${selected.d}`
    : "all";

  // 연도 드롭다운 범위 — 오늘 기준 넉넉히 + 현재 보는 연도가 항상 포함되도록 보정
  const yearMin = Math.min(td.getFullYear() - 30, view.y);
  const yearMax = Math.max(td.getFullYear() + 10, view.y);
  const years: number[] = [];
  for (let y = yearMin; y <= yearMax; y++) years.push(y);

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
          <div className="relative flex items-center gap-1 text-sm font-light tracking-[0.15em] tabular-nums text-text">
            <button
              type="button"
              onClick={() => setPicker((p) => (p === "year" ? null : "year"))}
              aria-label="연도 선택"
              className="rounded px-1 py-0.5 transition-colors hover:bg-line/50"
            >
              {view.y}
            </button>
            <span>.</span>
            <button
              type="button"
              onClick={() => setPicker((p) => (p === "month" ? null : "month"))}
              aria-label="월 선택"
              className="rounded px-1 py-0.5 transition-colors hover:bg-line/50"
            >
              {String(view.m + 1).padStart(2, "0")}
            </button>

            {picker !== null && (
              <>
                {/* 바깥 클릭으로 닫기 */}
                <button
                  type="button"
                  aria-label="닫기"
                  onClick={() => setPicker(null)}
                  className="fixed inset-0 z-[64] cursor-default"
                />
                <div className="absolute left-1/2 top-[calc(100%+0.4rem)] z-[65] origin-top -translate-x-1/2 animate-modal-pop overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                  {picker === "year" ? (
                    <div
                      ref={yearListRef}
                      className="max-h-36 w-36 overflow-y-auto p-2"
                    >
                      <div className="grid grid-cols-3 gap-1">
                        {years.map((y) => (
                          <button
                            key={y}
                            type="button"
                            data-current={y === view.y ? "true" : undefined}
                            onClick={() => {
                              jumpTo(y, view.m);
                              setPicker(null);
                            }}
                            className={`rounded-lg py-1.5 text-center text-[0.7rem] tabular-nums transition-colors ${
                              y === view.y
                                ? "bg-primary font-medium text-white"
                                : "text-text hover:bg-line/40"
                            }`}
                          >
                            {y}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="grid w-36 grid-cols-3 gap-1 p-2">
                      {Array.from({ length: 12 }, (_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            jumpTo(view.y, i);
                            setPicker(null);
                          }}
                          className={`rounded-lg py-1.5 text-center text-[0.7rem] tabular-nums transition-colors ${
                            i === view.m
                              ? "bg-primary font-medium text-white"
                              : "text-text hover:bg-line/40"
                          }`}
                        >
                          {i + 1}월
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
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
        </div>
        {/* 날짜 그리드 — 달이 바뀌면 key가 바뀌어 방향대로 슬라이드+페이드 재생.
            overflow-hidden: 슬라이드(translateX)가 가로로 넘쳐 스크롤 생기는 것 방지
            (팝오버는 이 래퍼 밖에 있어 잘리지 않음) */}
        <div
          className="overflow-hidden"
          style={{ touchAction: "pan-y" }}
          onTouchStart={onGridTouchStart}
          onTouchMove={onGridTouchMove}
          onTouchEnd={onGridTouchEnd}
        >
          <div
            key={view.y * 12 + view.m}
            className={`grid grid-cols-7 text-center ${
              dir >= 0 ? "animate-cal-next" : "animate-cal-prev"
            }`}
          >
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
            const isRed =
              weekday === 0 || viewHolidays[holidayKey(view.y, view.m, d)] != null;
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
      </div>

      <div key={listKey} className="animate-list-fade">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs tracking-[0.15em] text-text-muted">
          {selected ? (
            <>
              {selected.m + 1}월 {selected.d}일
              {selectedHoliday ? (
                <span className="text-error"> · {selectedHoliday}</span>
              ) : null}
              {isSelectedToday ? " (TODAY)" : null}
            </>
          ) : (
            `${view.m + 1}월 일정`
          )}
        </span>
        <div className="flex items-center gap-3">
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs tracking-[0.15em] text-text-muted transition-colors hover:text-text"
            >
              {view.m + 1}월 일정
            </button>
          )}
          {showTodayButton && (
            <button
              type="button"
              onClick={goToToday}
              className="rounded-full border border-line px-2.5 py-0.5 text-xs tracking-[0.15em] text-text-muted transition-colors hover:border-text-muted hover:text-text"
            >
              오늘
            </button>
          )}
        </div>
      </div>

      {isPending ? (
        <p className="py-6 text-center text-sm text-text-muted">불러오는 중…</p>
      ) : listItems.length > 0 ? (
        <ul className="flex flex-col">
          {listItems.map((a) => {
            const dday = ddayDisplay(a, todayMs);
            const range = rangeLabel(a);
            // 고정(가상) 일정은 읽기 전용 — 수정 폼을 열지 않는 정적 행으로 표시
            const rowClass =
              "flex w-full items-center justify-between gap-3 border-b border-line py-5 text-left";
            const inner = (
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-xs tracking-[0.15em] text-text-muted">
                    {a.title}
                    {a.yearly ? " · 매년" : ""}
                    {range ? ` · ${range}` : ""}
                    {a.author
                      ? ` · ${a.author.displayName ?? a.author.username}`
                      : ""}
                  </span>
                  <span className="text-sm font-light tracking-wide">
                    {formatRange(a)}
                  </span>
                </div>
                <span
                  className={`shrink-0 tabular-nums text-text ${
                    dday === "진행 중"
                      ? "text-base font-normal"
                      : "text-3xl font-light"
                  }`}
                >
                  {dday}
                </span>
              </>
            );
            return (
              <li key={a.id}>
                {a.virtual ? (
                  <div className={rowClass}>{inner}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openEdit(a)}
                    className={`${rowClass} transition-colors hover:bg-bg`}
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-5 text-center text-sm text-text-muted">
          일정이 없습니다.
        </p>
      )}
      </div>


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
                {/* 연일 토글 시 날짜 영역 페이드(key 변경으로 재생) */}
                <div
                  key={isRange ? "range" : "single"}
                  className="animate-list-fade"
                >
                  {isRange ? (
                    // 연일: 시작 ~ 끝 날짜를 flex로
                    <div className="flex items-center gap-2">
                      <DateField value={date} onChange={setDate} />
                      <span className="shrink-0 text-text-muted">~</span>
                      <DateField
                        value={endDate}
                        onChange={setEndDate}
                        min={date || undefined}
                      />
                    </div>
                  ) : (
                    <DateField value={date} onChange={setDate} />
                  )}
                </div>
              </label>

              {/* 연일·매년 반복 체크 — 가로. 연일이면 매년 반복은 자리는 유지하고 페이드아웃 */}
              <div className="flex items-center gap-6">
                <CheckButton
                  checked={isRange}
                  label="연일"
                  onClick={() => {
                    const nv = !isRange;
                    // iOS는 탭(터치)으로 촉발된 CSS 트랜지션/애니메이션의 첫 프레임을
                    // 스킵한다(스와이프 달 이동과 동일 이슈) → 다음 프레임으로 미뤄
                    // 매년반복 페이드아웃 + 날짜 영역 페이드가 재생되게 함
                    requestAnimationFrame(() => {
                      setIsRange(nv);
                      if (nv) setYearly(false);
                      else setEndDate("");
                    });
                  }}
                />
                {/* iOS WebKit은 합성 레이어가 없으면 opacity 트랜지션을 부드럽게
                    재생하지 않고 즉시 점프시킨다 → translateZ(0)+will-change로 레이어 승격 */}
                <div
                  style={{ transform: "translateZ(0)", willChange: "opacity" }}
                  className={`transition-opacity duration-200 ${
                    isRange ? "pointer-events-none opacity-0" : "opacity-100"
                  }`}
                >
                  <CheckButton
                    checked={yearly}
                    label="매년 반복"
                    onClick={() => setYearly((v) => !v)}
                  />
                </div>
              </div>

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
