import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "./theme-script";
import { IncomingReactGrabProvider } from "@/components/IncomingReactGrabProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Basalt — AI Agent Kanban",
  description: "AI 에이전트 기반 개발 태스크 자동화 시스템. 칸반 보드에서 계획부터 코드 작성, 검증, PR 생성까지.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <IncomingReactGrabProvider>
          {children}
        </IncomingReactGrabProvider>
      </body>
    </html>
  );
}
