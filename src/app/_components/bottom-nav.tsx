"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStandalone } from "@/lib/use-standalone";
import { useGallerySelectionStore } from "@/lib/gallery-selection-store";

// 차근차근 추가 예정 — 현재 4개 탭 (public/asset/images/tabbar 기준)
const ITEMS = [
  { href: "/", label: "홈", icon: "/asset/images/tabbar/home.svg" },
  { href: "/calendar", label: "디데이", icon: "/asset/images/tabbar/calendar.svg" },
  { href: "/gallery", label: "갤러리", icon: "/asset/images/tabbar/image.svg" },
  { href: "/profile", label: "프로필", icon: "/asset/images/tabbar/user.svg" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();
  const standalone = useStandalone();
  const selecting = useGallerySelectionStore((s) => s.selecting);
  const count = useGallerySelectionStore((s) => s.selectedIds.size);
  const exitSelection = useGallerySelectionStore((s) => s.exit);
  const openConfirm = useGallerySelectionStore((s) => s.openConfirm);

  // 로그인 화면에서는 숨김
  if (pathname === "/login") return null;

  // 갤러리에서 선택 모드일 때만 취소/삭제 버튼으로 교체
  const selectionMode = selecting && pathname.startsWith("/gallery");

  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-line shadow-[0_-2px_16px_rgba(0,0,0,0.05)] ${
        // 설치형 PWA(주로 iOS)에서는 반투명 + 백드롭 블러로 네이티브 탭바 질감
        standalone
          ? "bg-surface/75 backdrop-blur-xl"
          : "bg-surface"
      }`}
    >
      {/* 탭 ↔ 선택(취소/삭제) 두 레이어를 겹쳐 opacity로 크로스페이드 →
          진입·취소 양방향 모두 부드럽게 전환된다(탭 레이어가 높이 기준). */}
      <div className="relative">
        <ul
          className={`mx-auto flex max-w-md items-stretch justify-around pb-[env(safe-area-inset-bottom)] transition-opacity duration-200 ${
            selectionMode ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={selectionMode}
        >
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="flex flex-col items-center justify-center gap-1 py-2"
                >
                  {/* SVG를 mask로 사용 → 테마 색(currentColor 대신 bg)으로 채색 */}
                  <span
                    aria-hidden
                    className={`size-6 transition-colors duration-200 ${
                      active ? "bg-primary" : "bg-text-muted"
                    }`}
                    style={{
                      maskImage: `url(${item.icon})`,
                      WebkitMaskImage: `url(${item.icon})`,
                      maskRepeat: "no-repeat",
                      WebkitMaskRepeat: "no-repeat",
                      maskPosition: "center",
                      WebkitMaskPosition: "center",
                      maskSize: "contain",
                      WebkitMaskSize: "contain",
                    }}
                  />
                  {/* 아이콘 아래 라벨 — 활성 탭은 강조색 */}
                  <span
                    className={`text-[0.6875rem] leading-none transition-colors duration-200 ${
                      active ? "font-medium text-primary" : "text-text-muted"
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* 선택 모드 레이어 — 탭 위에 겹쳐 크로스페이드 */}
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            selectionMode ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={!selectionMode}
        >
          <div className="mx-auto flex max-w-md items-stretch pb-[env(safe-area-inset-bottom)]">
            <button
              type="button"
              onClick={exitSelection}
              tabIndex={selectionMode ? 0 : -1}
              // 기본 탭(py-2 + 아이콘 1.5rem + gap 0.25rem + 라벨 0.6875rem = 3.4375rem)과 높이 일치
              className="flex h-[3.4375rem] flex-1 items-center justify-center text-sm font-medium text-text-muted transition-opacity hover:opacity-60"
            >
              취소
            </button>
            <button
              type="button"
              onClick={openConfirm}
              disabled={count === 0}
              tabIndex={selectionMode ? 0 : -1}
              className="flex h-[3.4375rem] flex-1 items-center justify-center text-sm font-semibold text-error transition-opacity hover:opacity-60 disabled:opacity-40"
            >
              삭제{count > 0 ? ` (${count})` : ""}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
