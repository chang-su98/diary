"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type LikeState = { liked: boolean; count: number };

const likeKey = (photoId: number) => ["photo-like", photoId] as const;

// 좋아요 켜진 하트 색 — 모노크롬 팔레트 위 유일한 감성 액센트(커플 앱).
const LIKED_COLOR = "#ff5a76";

/**
 * 사진 상세의 좋아요(하트) 버튼. 폐쇄형 2인 앱이라 "내가 눌렀는지 + 총 개수(0~2)"를 보여준다.
 * 상태는 TanStack Query로 상세 열릴 때 조회하고, 토글은 낙관적 업데이트로 즉시 반영한다.
 */
export function PhotoLikeButton({ photoId }: { photoId: number }) {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: likeKey(photoId),
    queryFn: async (): Promise<LikeState> => {
      const res = await fetch(`/api/photos/${photoId}/like`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async (): Promise<LikeState> => {
      const res = await fetch(`/api/photos/${photoId}/like`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    // 낙관적 토글 — 응답 전에 하트/개수를 즉시 반영
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: likeKey(photoId) });
      const prev = qc.getQueryData<LikeState>(likeKey(photoId));
      if (prev) {
        qc.setQueryData<LikeState>(likeKey(photoId), {
          liked: !prev.liked,
          count: prev.count + (prev.liked ? -1 : 1),
        });
      }
      return { prev };
    },
    onError: (error, _vars, ctx) => {
      console.warn("[gallery] 좋아요 토글 실패:", error);
      if (ctx?.prev) qc.setQueryData(likeKey(photoId), ctx.prev);
    },
    onSuccess: (state) => qc.setQueryData(likeKey(photoId), state),
  });

  const liked = data?.liked ?? false;
  const count = data?.count ?? 0;

  return (
    <button
      type="button"
      onClick={() => mutate()}
      disabled={isPending}
      aria-label={liked ? "좋아요 취소" : "좋아요"}
      aria-pressed={liked}
      className="ml-auto flex items-center gap-1.5 p-1 text-text transition-opacity hover:opacity-60 focus:outline-none disabled:opacity-60"
    >
      {/* 숫자 칸은 너비 고정(0~2 모두 동일) → 개수 변화에도 하트가 흔들리지 않음 */}
      <span className="w-3 text-right text-sm tabular-nums text-text-muted">
        {count > 0 ? count : ""}
      </span>
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        width={22}
        height={22}
        className="size-[22px] transition-transform duration-200 active:scale-90"
        fill={liked ? LIKED_COLOR : "none"}
        stroke={liked ? LIKED_COLOR : "currentColor"}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
