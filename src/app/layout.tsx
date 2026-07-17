import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Amreen",
  description: "Adaptive learning, built carefully and affordably.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body className="antialiased">{children}</body>
    </html>
  );
}
