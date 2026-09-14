import CryptoProviders from "@/components/crypto";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { Geist, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";

export const metadata: Metadata = {
  applicationName: "CCTP Bridge",
  title: "Bridge USDC across EVM & Solana via CCTP",
  twitter: { card: "summary_large_image", images: ["https://www.cctp.io/og.png"] },
  openGraph: {
    siteName: "CCTP.io",
    type: "website",
    title: "CCTP Bridge — Bridge USDC across EVM & Solana",
    description:
      "Bridge USDC natively across Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, and Solana using Circle's CCTP v2 infrastructure.",
    images: [
      {
        url: "https://www.cctp.io/og.png",
        width: 1000,
        height: 525,
        alt: "CCTP Bridge — Bridge native USDC across EVM and Solana",
      },
    ],
  },
  description:
    "Bridge USDC natively across EVM chains and Solana using Circle's CCTP v2 infrastructure. Compare Fast and Standard transfers, review fees, and find or resume a transfer.",
  keywords: [
    "USDC",
    "CCTP",
    "Bridge",
    "Circle",
    "Stablecoin",
    "Ethereum",
    "Solana",
    "Arbitrum",
    "Base",
    "Optimism",
    "Polygon",
    "Avalanche",
    "Cross-chain",
  ],
  metadataBase: new URL("https://www.cctp.io"),
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Analytics />
        <ErrorBoundary>
          <CryptoProviders>{children}</CryptoProviders>
        </ErrorBoundary>
      </body>
    </html>
  );
}
