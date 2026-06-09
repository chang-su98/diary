import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "./_components/pwa-register";
import { QueryProvider } from "./_components/query-provider";

export const metadata: Metadata = {
  title: "기록",
  description: "함께 쓰는 기록 앱",
  applicationName: "기록",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "기록",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e1e1e",
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
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
