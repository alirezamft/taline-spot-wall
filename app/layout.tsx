import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "بازار اسپات طلای ۱۸ عیار",
  description: "نمای زنده بازار اسپات، نمودار قیمت و دفتر سفارش‌های طلای ۱۸ عیار",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
