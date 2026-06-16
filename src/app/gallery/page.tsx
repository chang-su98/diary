import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PHOTO_PAGE_SIZE } from "@/app/api/photos/route";
import { GalleryUpload } from "./gallery-upload";
import { GalleryGrid } from "./gallery-grid";
import { GallerySelectionController } from "./gallery-selection-controller";

export default async function GalleryPage() {
  const session = await getSession();
  if (!session) redirect("/login"); // proxy로도 보호되지만 방어적

  // 첫 페이지 사진 + 현재 사용자를 병렬 조회(서로 독립 → 워터폴 제거).
  // 첫 페이지만 조회하고 나머지는 클라이언트 무한 스크롤로 추가 로드한다.
  const [photos, me] = await Promise.all([
    prisma.photo.findMany({
      orderBy: { id: "desc" }, // id desc = 최신순(autoincrement), 커서와 일치
      take: PHOTO_PAGE_SIZE,
      select: {
        id: true, // 이미지는 /api/photos/[id]/raw 로 서빙 — 메타만 내려보냄
        width: true,
        height: true,
        // 상세 모달의 등록자 표시용 — author는 삭제 시 null
        author: { select: { username: true, displayName: true, avatar: true } },
      },
    }),
    // 업로드 직후 낙관적 추가(스토어)에 등록자로 표시할 현재 사용자
    prisma.user.findUnique({
      where: { id: Number(session.sub) },
      select: { username: true, displayName: true, avatar: true },
    }),
  ]);
  const initialCursor =
    photos.length === PHOTO_PAGE_SIZE ? photos[photos.length - 1].id : null;

  return (
    <main className="relative mx-auto w-full max-w-md px-4 pt-[calc(2rem+var(--safe-top))] pb-[calc(4rem+var(--safe-bottom))]">
      <GalleryUpload currentUser={me} hasPhotos={photos.length > 0} />

      <h1 className="mb-10 pl-[0.3em] text-center text-2xl font-light tracking-[0.3em]">
        GALLERY
      </h1>

      {photos.length === 0 ? (
        <p className="mt-24 text-center text-sm tracking-wide text-text-muted">
          아직 사진이 없어요.
          <br />
          오른쪽 위 + 로 추가해 보세요.
        </p>
      ) : (
        <>
          {/* 첫 페이지가 바뀌면(업로드·새로고침) key 변경으로 리마운트 → 목록 재시드 */}
          <GalleryGrid
            key={`${photos[0].id}:${photos.length}`}
            initialPhotos={photos}
            initialCursor={initialCursor}
          />
          <GallerySelectionController />
        </>
      )}
    </main>
  );
}
