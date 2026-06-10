"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 차근차근 추가 예정 — 현재 4개 탭 (public/asset/images/tabbar 기준)
const ITEMS = [
  { href: "/", label: "홈", icon: "/asset/images/tabbar/home.svg" },
  { href: "/calendar", label: "캘린더", icon: "/asset/images/tabbar/calendar.svg" },
  { href: "/gallery", label: "갤러리", icon: "/asset/images/tabbar/image.svg" },
  { href: "/profile", label: "내 정보", icon: "/asset/images/tabbar/user.svg" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();
  // 로그인 화면에서는 숨김
  if (pathname === "/login") return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-line bg-surface shadow-[0_-2px_16px_rgba(0,0,0,0.05)]">
      <ul className="mx-auto flex max-w-md items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className="flex items-center justify-center py-3.5"
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
