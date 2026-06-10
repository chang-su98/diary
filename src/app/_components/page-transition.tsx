"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * 라우트 경로가 바뀔 때마다 key가 바뀌어 콘텐츠가 리마운트 → 페이드인 재생.
 * 루트 template과 달리 첫 세그먼트가 같은 중첩 이동(/profile → /profile/edit)도 동작한다.
 * (하단 탭바는 이 래퍼 밖 layout에 있어 전환 영향을 받지 않음)
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-fade">
      {children}
    </div>
  );
}
