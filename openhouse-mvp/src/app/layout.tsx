import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from './components/Providers'
import { Header } from './components/Header'

const inter = Inter({ subsets: ["latin"] });

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
        className={`${inter.className} antialiased`}
      >
        <Providers>
          <div className="min-h-screen bg-openhouse-bg">
            <Header />
            <main>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
