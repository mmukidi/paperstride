import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://paperstride.duckdns.org";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "PaperStride | Worksheets built around what they love",
    template: "%s | PaperStride"
  },
  description:
    "An expert engine that turns a child's interests into a personalized, printable workbook — Pre-K through Grade 12, tuned with sliders, printed in minutes. No screens, no accounts.",
  openGraph: {
    title: "PaperStride",
    description:
      "Turn what they love into how they learn. Personalized printable workbooks, designed by an expert engine.",
    url: siteUrl,
    siteName: "PaperStride",
    images: [
      {
        url: "/paperstride-hero.webp",
        width: 1400,
        height: 748,
        alt: "Printed worksheets, pencils, and a notebook on a bright study desk"
      }
    ],
    locale: "en_US",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "PaperStride",
    description:
      "Turn what they love into how they learn. Personalized printable workbooks, designed by an expert engine.",
    images: ["/paperstride-hero.webp"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
