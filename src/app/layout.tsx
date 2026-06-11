import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "./_components/pwa-register";
import { QueryProvider } from "./_components/query-provider";
import { BottomNav } from "./_components/bottom-nav";
import { PageTransition } from "./_components/page-transition";
import { PullToRefresh } from "./_components/pull-to-refresh";

export const metadata: Metadata = {
  title: "Record",
  description: "함께 쓰는 기록 앱",
  applicationName: "Record",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Record",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e1e1e",
  // iOS standalone PWA에서 env(safe-area-inset-*) 값을 실제 인셋으로 채우려면 필수
  // (미지정 시 항상 0 → 홈 인디케이터가 하단 탭바를 침범)
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <PWARegister />
        <QueryProvider>
          <PullToRefresh>
            <PageTransition>{children}</PageTransition>
          </PullToRefresh>
        </QueryProvider>
        <BottomNav />
      </body>
    </html>
  );
}
