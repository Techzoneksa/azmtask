import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";

import "./globals.css";

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-arabic",
});

/*
 * The root layout runs for the login screen too, where there is no session and no
 * property context, so the title stays on the product name. The authenticated shell
 * names the actual property, which is where it matters.
 */
export const metadata: Metadata = {
  title: {
    default: "نظام إدارة الفنادق",
    template: "%s | نظام إدارة الفنادق",
  },
  description:
    "نظام سحابي لإدارة الفنادق والشقق المخدومة: الحجوزات، النزلاء، الوحدات، النظافة، الصيانة، المدفوعات والتقارير.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f6a69",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={arabic.variable}>
      <body>{children}</body>
    </html>
  );
}
