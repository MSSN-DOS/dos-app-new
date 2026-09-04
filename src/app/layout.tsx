import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { AuthProvider } from "@/components/auth/auth-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DOS Site — MSSN Unilorin",
  description:
    "Free learning and assessment platform for Muslim students and JAMB aspirants — Board of Studies, MSSN, University of Ilorin",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/dos-icon.svg", type: "image/svg+xml" },
      { url: "/dos-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/dos-icon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${jakarta.variable} ${jetbrains.variable}`}
    >
      <body className="antialiased" style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
        <a
          href="#main"
          className="sr-only z-50 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-md focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Skip to content
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <AuthProvider>
              <QueryProvider>{children}</QueryProvider>
            </AuthProvider>
            <Toaster position="top-center" richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
