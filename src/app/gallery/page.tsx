import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { GalleryUpload } from "./gallery-upload";
import { GalleryGrid } from "./gallery-grid";

export default async function GalleryPage() {
  const session = await getSession();
  if (!session) redirect("/login"); // proxy로도 보호되지만 방어적

  const photos = await prisma.photo.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      data: true,
      width: true,
      height: true,
      // 상세 모달의 등록자 표시용 — author는 삭제 시 null
      author: { select: { username: true, displayName: true, avatar: true } },
    },
  });

  return (
    <main className="relative mx-auto w-full max-w-md px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <GalleryUpload />

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
        <GalleryGrid photos={photos} />
      )}
    </main>
  );
}
