import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { GalleryUpload } from "./gallery-upload";

export default async function GalleryPage() {
  const session = await getSession();
  if (!session) redirect("/login"); // proxy로도 보호되지만 방어적

  const photos = await prisma.photo.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, data: true, width: true, height: true },
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
        // CSS columns 기반 핀터레스트식 메이슨리 — 세로 간격은 타일 mb로 부여
        <div className="columns-2 gap-2 [&>*]:mb-2">
          {photos.map((p) => (
            <figure
              key={p.id}
              className="break-inside-avoid overflow-hidden rounded-xl border border-line bg-bg"
              // 원본 비율을 미리 잡아 레이아웃 시프트 방지
              style={{ aspectRatio: `${p.width} / ${p.height}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL 이미지 */}
              <img
                src={p.data}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            </figure>
          ))}
        </div>
      )}
    </main>
  );
}
