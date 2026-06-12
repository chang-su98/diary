"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useStandalone } from "@/lib/use-standalone";
import { useGallerySelectionStore } from "@/lib/gallery-selection-store";

// 현재 4개 탭. 아이콘은 인라인 SVG로 렌더 → mask-image(별도 요청)의 첫 로딩 지연 제거.
const ITEMS = [
  { href: "/", label: "홈" },
  { href: "/calendar", label: "디데이" },
  { href: "/gallery", label: "갤러리" },
  { href: "/profile", label: "프로필" },
] as const;

// 탭 아이콘(feather 스타일). stroke=currentColor → 텍스트 색(활성 primary/비활성 muted)을 따른다.
const TAB_ICONS: Record<string, ReactNode> = {
  "/": (
    <path d="M9 22V12H15V22M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" />
  ),
  "/calendar": (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  "/gallery": (
    <path d="M5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21ZM5 21L16 10L21 15M10 8.5C10 9.32843 9.32843 10 8.5 10C7.67157 10 7 9.32843 7 8.5C7 7.67157 7.67157 7 8.5 7C9.32843 7 10 7.67157 10 8.5Z" />
  ),
  "/profile": (
    <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" />
  ),
};

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
                  {/* 인라인 SVG — HTML과 함께 즉시 렌더(첫 로딩 시 아이콘 지연 없음) */}
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`size-6 transition-colors duration-200 ${
                      active ? "text-primary" : "text-text-muted"
                    }`}
                  >
                    {TAB_ICONS[item.href]}
                  </svg>
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
