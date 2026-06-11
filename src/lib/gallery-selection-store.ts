import { create } from "zustand";

// 갤러리 삭제용 다중 선택 모드 상태. + 메뉴·타일·푸터(BottomNav)·확인 다이얼로그가 공유한다.
interface GallerySelectionState {
  selecting: boolean; // 선택 모드 on/off
  selectedIds: Set<number>; // 선택된 사진 id
  confirmOpen: boolean; // 삭제 확인 다이얼로그 표시 여부
  allIds: number[]; // 현재 그리드에 보이는 전체 사진 id(전체선택용) — 그리드가 동기화
  enter: () => void;
  exit: () => void;
  toggle: (id: number) => void;
  setAllIds: (ids: number[]) => void;
  selectAll: () => void;
  deselectAll: () => void;
  openConfirm: () => void;
  closeConfirm: () => void;
}

export const useGallerySelectionStore = create<GallerySelectionState>((set) => ({
  selecting: false,
  selectedIds: new Set(),
  confirmOpen: false,
  allIds: [],
  enter: () =>
    set({ selecting: true, selectedIds: new Set(), confirmOpen: false }),
  exit: () =>
    set({ selecting: false, selectedIds: new Set(), confirmOpen: false }),
  // 매번 새 Set을 만들어 구독 컴포넌트가 리렌더되게 한다
  toggle: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),
  // 그리드가 현재 보이는 id 목록을 동기화(전체선택의 소스)
  setAllIds: (ids) => set({ allIds: ids }),
  // 현재 보이는 사진 전부 선택
  selectAll: () => set((state) => ({ selectedIds: new Set(state.allIds) })),
  // 선택만 해제(선택 모드는 유지) — exit과 달리 selecting을 끄지 않는다
  deselectAll: () => set({ selectedIds: new Set() }),
  // 선택이 하나도 없으면 다이얼로그를 열지 않는다
  openConfirm: () =>
    set((state) => (state.selectedIds.size > 0 ? { confirmOpen: true } : state)),
  closeConfirm: () => set({ confirmOpen: false }),
}));
