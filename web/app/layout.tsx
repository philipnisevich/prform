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
  title: "Receipts — ask about someone's week, get a cited packet",
  description:
    "Receipts answers a spoken question about a person's recent work by assembling a cited evidence packet from Slack, Linear, GitHub, and your CRM — never a verdict. No source link, no sentence. The agent gathers; the human judges.",
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
