import { create } from "zustand";
import type { GalleryPhoto } from "@/app/gallery/types";

// 업로드 직후 클라이언트에서 즉시 추가한 사진들(최신순). 그리드가 이를 prepend로 받아
// 같은 메이슨리 인스턴스에서 위치 트랜지션(아이폰 사진첩식 밀려나는 효과)을 낸다.
// 서버 새로고침(pull-refresh) 시에는 부모 key 리마운트로 자연 정리되고, dedup으로 중복 방지.
interface GalleryState {
  added: GalleryPhoto[];
  // 삭제 축소·페이드 애니메이션 중인 사진 id. 이 타일들은 원래 자리에서 줄어들고,
  // 레이아웃 계산에서는 제외되어 나머지 타일이 빈자리로 흘러 들어간다(아이폰식 재정렬).
  deletingIds: Set<number>;
  // 애니메이션이 끝나 화면에서 완전히 빼버린 사진 id. 그리드 items에서 필터링된다.
  // (서버 삭제는 이미 완료된 상태 — 클라이언트 목록만 정리)
  removedIds: Set<number>;
  // 업로드가 모두 끝난 뒤 한 번에 추가(한 장씩 넣으면 레이아웃 높이가 어긋남)
  prependMany: (photos: GalleryPhoto[]) => void;
  // 삭제 성공 직후 호출 → 타일 축소·페이드 시작 + 나머지 타일 재정렬
  startDeleting: (ids: number[]) => void;
  // 애니메이션 종료 후 호출 → 해당 타일을 목록에서 완전히 제거(언마운트)
  finalizeDelete: (ids: number[]) => void;
  clear: () => void;
}

export const useGalleryStore = create<GalleryState>((set) => ({
  added: [],
  deletingIds: new Set(),
  removedIds: new Set(),
  prependMany: (photos) =>
    set((state) => ({ added: [...photos, ...state.added] })),
  startDeleting: (ids) => set({ deletingIds: new Set(ids) }),
  finalizeDelete: (ids) =>
    set((state) => {
      const removed = new Set(state.removedIds);
      const deleting = new Set(state.deletingIds);
      for (const id of ids) {
        removed.add(id);
        deleting.delete(id);
      }
      return { removedIds: removed, deletingIds: deleting };
    }),
  clear: () =>
    set({ added: [], deletingIds: new Set(), removedIds: new Set() }),
}));
