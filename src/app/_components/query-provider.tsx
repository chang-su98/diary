"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * TanStack Query Provider.
 * QueryClient를 useState로 한 번만 생성해 리렌더 시 재생성되지 않도록 한다.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 회원·일정 등은 자주 안 바뀌고 변경 시 mutation이 invalidate하므로,
            // staleTime을 늘려 페이지 이동마다 재요청하지 않게 한다(체감 속도↑).
            // gcTime을 더 길게 둬 메인↔캘린더 왕복 시 캐시가 살아있게 한다.
            staleTime: 5 * 60 * 1000, // 5분
            gcTime: 30 * 60 * 1000, // 30분
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
