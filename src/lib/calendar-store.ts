import { create } from "zustand";

// 달력 점프 신호 — 슬라이드1(생일·기념일)에서 항목을 누르면 달력 슬라이드로 넘어가
// 그 날짜를 선택하게 한다. nonce는 같은 날짜를 다시 눌러도 반영되도록 매번 증가.
type CalendarTarget = { y: number; m: number; d: number }; // m: 0-based

interface CalendarState {
  target: CalendarTarget | null;
  nonce: number;
  jumpToDate: (y: number, m: number, d: number) => void;
}

export const useCalendarStore = create<CalendarState>((set) => ({
  target: null,
  nonce: 0,
  jumpToDate: (y, m, d) =>
    set((s) => ({ target: { y, m, d }, nonce: s.nonce + 1 })),
}));
