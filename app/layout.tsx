import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const siteUrl = "https://www.hvkinfotech.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "HVK Infotech | Innovate • Build • Grow",
  description:
    "HVK Infotech provides practical training, internships, career guidance, placement assistance, workshops and technology solutions.",
  keywords: [
    "HVK Infotech",
    "training and certification",
    "internship programs",
    "placement assistance",
    "career guidance",
  ],
  authors: [{ name: "HVK Infotech" }],
  icons: {
    icon: "/images/hvk-logo.png",
    shortcut: "/images/hvk-logo.png",
    apple: "/images/hvk-logo.png",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "HVK Infotech",
    title: "HVK Infotech | Innovate • Build • Grow",
    description:
      "HVK Infotech provides practical training, internships, career guidance, placement assistance, workshops and technology solutions.",
    images: [
      {
        url: "/images/hvk-logo.png",
        width: 512,
        height: 512,
        alt: "HVK Infotech",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "HVK Infotech | Innovate • Build • Grow",
    description:
      "HVK Infotech provides practical training, internships, career guidance, placement assistance, workshops and technology solutions.",
    images: ["/images/hvk-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-app-bg font-sans text-ink antialiased dark:bg-dark-bg dark:text-slate-100">
        <ThemeProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-navy focus:shadow-card"
          >
            Skip to main content
          </a>
          <AnnouncementBar />
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
