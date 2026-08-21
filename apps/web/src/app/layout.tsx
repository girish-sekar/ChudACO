import type { Metadata } from "next";
import { Baloo_2, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const headingFont = Baloo_2({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["500", "600", "700", "800"],
});

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "ChudACO",
  description: "Discord-gated checkout dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${headingFont.variable} ${bodyFont.variable} ${monoFont.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
