import { create } from "zustand";
import type { GalleryPhoto } from "@/app/gallery/types";

// 업로드 직후 클라이언트에서 즉시 추가한 사진들(최신순). 그리드가 이를 prepend로 받아
// 같은 masonic 인스턴스에서 위치 트랜지션(아이폰 사진첩식 밀려나는 효과)을 낸다.
// 서버 새로고침(pull-refresh) 시에는 부모 key 리마운트로 자연 정리되고, dedup으로 중복 방지.
interface GalleryState {
  added: GalleryPhoto[];
  prepend: (photo: GalleryPhoto) => void;
  clear: () => void;
}

export const useGalleryStore = create<GalleryState>((set) => ({
  added: [],
  prepend: (photo) => set((state) => ({ added: [photo, ...state.added] })),
  clear: () => set({ added: [] }),
}));
