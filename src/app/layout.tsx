import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "./_components/pwa-register";
import { QueryProvider } from "./_components/query-provider";

export const metadata: Metadata = {
  title: "Diary",
  description: "온라인 일기 앱",
  applicationName: "Diary",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Diary",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
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
