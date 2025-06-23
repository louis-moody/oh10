import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from './components/Providers'
import { AuthenticationFlow } from './components/AuthenticationFlow'
import Link from "next/link";

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
        <Providers>
          <div className="min-h-screen bg-openhouse-bg">
            <header className="border-b border-openhouse-border/20 bg-openhouse-bg/80 backdrop-blur-sm sticky top-0 z-50">
              <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                <div className="flex items-center gap-8">
                  <h1 className="font-heading text-xl font-bold text-openhouse-fg">
                    <Link href="/">OpenHouse</Link>
                  </h1>
                  <nav className="hidden md:flex items-center gap-6">
                    <Link href="/" className="text-openhouse-fg-muted hover:text-openhouse-fg transition-colors">
                      Properties
                    </Link>
                    <Link href="/wallet" className="text-openhouse-fg-muted hover:text-openhouse-fg transition-colors">
                      Wallet
                    </Link>
                  </nav>
                </div>
                <AuthenticationFlow />
              </div>
            </header>
            <main>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
