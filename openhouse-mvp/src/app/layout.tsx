import type { Metadata } from "next";
import "./globals.css";
import { Providers } from './components/Providers'
import { Header } from './components/Header'
import { DarkModeToggle } from './components/DarkModeToggle'

export const metadata: Metadata = {
  title: "Build your legacy - Openhouse",
  description: "Invest in UK real estate through tokenized crowdfunding on Base L2. Transparent, on-chain property investment with USDC.",
  keywords: ["real estate", "tokenization", "crowdfunding", "Base L2", "USDC", "property investment"],
  openGraph: {
    title: "Build your legacy - Openhouse",
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
        className="antialiased"
      >
        <Providers>
          <div className="min-h-screen bg-openhouse-bg flex flex-col">
            <Header />
            <main className="flex-1">
              {children}
            </main>
            <footer className="border-t border-openhouse-border bg-openhouse-bg">
              <div className="container mx-auto px-4 py-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-openhouse-fg-muted">
                    © 2024 OpenHouse. All rights reserved.
                  </div>
                  <DarkModeToggle />
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
