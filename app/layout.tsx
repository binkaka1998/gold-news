import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Hệ thống Tin tức Giá Vàng AI",
    description: "Cập nhật giá vàng tự động bằng Gemini AI",
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="vi">
        <body className="bg-gray-100">{children}</body>
        </html>
    );
}
