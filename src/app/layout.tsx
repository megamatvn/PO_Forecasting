import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sagen PO Forecasting",
  description: "Lập kế hoạch mua hàng và phê duyệt PO",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
