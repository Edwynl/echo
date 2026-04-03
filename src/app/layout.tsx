import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { I18nProvider } from "@/lib/i18n";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Echo",
  description: "Echo - AI 驱动的视频内容管理与博文生成系统",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Echo',
  },
  icons: {
    icon: '/icon.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={inter.variable}>
      <body className="antialiased font-sans flex flex-col min-h-screen">
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
