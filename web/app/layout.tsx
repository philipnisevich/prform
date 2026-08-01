import type { Metadata } from "next";
import localFont from "next/font/local";
import { SmoothScroll } from "./components/SmoothScroll";
import "./globals.css";

const instrumentSerif = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "./fonts/InstrumentSerif-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/InstrumentSerif-Italic.woff2", weight: "400", style: "italic" },
  ],
});

export const metadata: Metadata = {
  title: "Witness — your engineering dashboard is lying to you",
  description:
    "Witness finds the engineering work that never gets credited, and confirms every finding against a second source — so restricting it to one connector doesn't go blank, it becomes a confident, wrong performance review. That's provable, not just claimed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
