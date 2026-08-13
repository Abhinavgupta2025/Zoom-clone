import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zoom Clone — Scalable Video Conferencing",
  description: "Next.js 14 + FastAPI + mediasoup SFU video conferencing platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zoom-darkBg text-gray-100 min-h-screen flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
