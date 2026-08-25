import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { BriefcaseBusiness } from "lucide-react";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ThemeToggle } from "@/components/theme-toggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EveryRole — Live jobs from top companies",
  description:
    "Browse thousands of open roles synced continuously from the careers pages of the world's best tech companies. No accounts required.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-dvh bg-background font-sans antialiased">
        <Providers>
          <header className="sticky top-0 z-50 h-14 border-b bg-background/80 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <BriefcaseBusiness className="size-4" />
                </span>
                <span className="text-[15px] font-semibold tracking-tight">
                  EveryRole
                </span>
                <span className="ml-1 hidden rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary sm:inline">
                  Live
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/status"
                  className="hidden text-xs text-muted-foreground hover:text-foreground md:inline"
                >
                  Synced from company ATS boards · Sync status →
                </Link>
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main>{children}</main>
          <footer className="border-t py-8">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-center text-xs text-muted-foreground sm:px-6 md:flex-row md:text-left">
              <p>
                EveryRole · Synced continuously from Ashby, Greenhouse, Lever,
                Workday, Apple, SmartRecruiters, Roblox &amp; HiringCafe.{" "}
                <Link
                  href="/status"
                  className="underline hover:text-foreground"
                >
                  Sync status
                </Link>
              </p>
              <p>Built with Next.js · Tailwind CSS · shadcn/ui</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
