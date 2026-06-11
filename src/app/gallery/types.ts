// 갤러리 사진 메타 — 그리드·모달·업로드 스토어 공용. 이미지 바이트는 /raw 라우트로 서빙.
export type GalleryPhoto = {
  id: number;
  width: number;
  height: number;
  author: {
    username: string;
    displayName: string | null;
    avatar: string | null;
  } | null;
};
