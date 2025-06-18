import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenHouse - Tokenized Real Estate Investment",
  description: "Invest in UK real estate through tokenized crowdfunding on Base L2. Transparent, on-chain property investment with USDC.",
  keywords: ["real estate", "tokenization", "crowdfunding", "Base L2", "USDC", "property investment"],
  openGraph: {
    title: "OpenHouse - Tokenized Real Estate Investment",
    description: "Invest in UK real estate through tokenized crowdfunding on Base L2",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
