import { create } from "zustand";

// 당겨서 새로고침(PullToRefresh) 전역 on/off 플래그.
// 갤러리 선택(드래그)처럼 위로 당기는 동작이 새로고침과 충돌하는 화면에서 잠시 끈다.
interface PullRefreshState {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}

export const usePullRefreshStore = create<PullRefreshState>((set) => ({
  enabled: true,
  setEnabled: (v) => set({ enabled: v }),
}));
