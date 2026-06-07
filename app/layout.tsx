import type { Metadata } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://paperstride.duckdns.org";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "PaperStride | Printable practice away from screens",
    template: "%s | PaperStride"
  },
  description:
    "Printable math and reading practice for Pre-K through Grade 8, built for focused learning away from screens.",
  openGraph: {
    title: "PaperStride",
    description:
      "Printable practice that helps students learn away from screens.",
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
      "Printable practice that helps students learn away from screens.",
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
      <body>{children}</body>
    </html>
  );
}
