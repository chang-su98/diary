// 갤러리 사진 메타 — 그리드·모달·업로드 스토어 공용. 이미지 바이트는 /raw 라우트로 서빙.
export type GalleryPhoto = {
  id: number;
  width: number;
  height: number;
  // 업로드 시각(ISO 문자열). 상세 모달의 날짜 표시용. 서버 JSON·낙관적 추가 모두 ISO로 통일.
  createdAt: string;
  author: {
    username: string;
    displayName: string | null;
    avatar: string | null;
  } | null;
};
