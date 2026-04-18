import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Dhwanix | Version control for musical ideas",
  description:
    "Capture, analyze, and evolve musical ideas with a studio-focused interface.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Navbar />
        <main className="min-h-screen pt-28">{children}</main>
      </body>
    </html>
  );
}
