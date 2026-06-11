import { create } from "zustand";
import type { GalleryPhoto } from "@/app/gallery/types";

// 업로드 직후 클라이언트에서 즉시 추가한 사진들(최신순). 그리드가 이를 prepend로 받아
// 같은 masonic 인스턴스에서 위치 트랜지션(아이폰 사진첩식 밀려나는 효과)을 낸다.
// 서버 새로고침(pull-refresh) 시에는 부모 key 리마운트로 자연 정리되고, dedup으로 중복 방지.
interface GalleryState {
  added: GalleryPhoto[];
  // 낙관적 삭제 — 삭제 성공 시 즉시 그리드에서 숨겨, 같은 masonic 인스턴스에서 남은
  // 타일이 위치 트랜지션으로 재정렬되게 한다(아이폰 사진첩식). 서버 재시드 시 리마운트로 정리.
  removedIds: Set<number>;
  // masonic 강제 리레이아웃 트리거. prepend로 어긋난 내부 위치 캐시를 바로잡기 위해
  // 값이 바뀌면 그리드가 <Masonry>의 key로 사용해 그 자식만 리마운트(재계산)한다.
  // 그리드 전체나 무한스크롤 누적·스크롤 위치는 보존된다.
  layoutNonce: number;
  // 업로드가 모두 끝난 뒤 한 번에 추가(한 장씩 넣으면 masonic이 높이를 못 잡아 레이아웃이 어긋남)
  prependMany: (photos: GalleryPhoto[]) => void;
  // 삭제한 id들을 숨김 집합에 추가 → 그리드가 즉시 필터링해 재정렬 슬라이드
  removeMany: (ids: number[]) => void;
  // 슬라이드 애니메이션 재생 후 호출 → masonic만 리마운트해 레이아웃 보정
  bumpLayout: () => void;
  clear: () => void;
}

export const useGalleryStore = create<GalleryState>((set) => ({
  added: [],
  removedIds: new Set(),
  layoutNonce: 0,
  prependMany: (photos) =>
    set((state) => ({ added: [...photos, ...state.added] })),
  // 매번 새 Set을 만들어 구독 컴포넌트가 리렌더되게 한다
  removeMany: (ids) =>
    set((state) => {
      const next = new Set(state.removedIds);
      for (const id of ids) next.add(id);
      return { removedIds: next };
    }),
  bumpLayout: () => set((state) => ({ layoutNonce: state.layoutNonce + 1 })),
  clear: () => set({ added: [], removedIds: new Set() }),
}));
