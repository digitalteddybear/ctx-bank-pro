import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { AstryxThemeProvider } from "@/components/ui/astryx-theme-provider";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Home | CTX BankPro | ASP Private Capital",
  description: "CTXBANKPRO contextual engineering workspace tailored for ASP Private Capital.",
  icons: {
    icon: [
      {
        url: "/assets/favicon-light.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/assets/favicon-dark.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: light)",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        <Script id="ctxbankpro-theme-preference" strategy="beforeInteractive">
          {`try { const preference = localStorage.getItem("ctxbankpro:theme-preference") || localStorage.getItem("ctxbankpro:application-theme") || "system"; const theme = preference === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : preference; if (theme === "light" || theme === "dark") { document.documentElement.dataset.theme = theme; document.documentElement.dataset.themePreference = preference; } } catch {}`}
        </Script>
      </head>
      <body>
        <AstryxThemeProvider>{children}</AstryxThemeProvider>
      </body>
    </html>
  );
}
