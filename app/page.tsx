import type { Metadata } from "next";
import { Suspense } from "react";
import { BridgeCardSkeleton } from "@/components/bridge-card-skeleton";
import { BridgePageShell } from "@/components/bridge-page-shell";
import HomeClientPage from "./home-client";
import { HomepageContent } from "@/components/homepage-content";

export const metadata: Metadata = {
  title: "CCTP Bridge — Bridge Native USDC | CCTP.io",
  description: "Bridge native USDC across Ethereum, Base, Arbitrum, Solana and other supported networks with Circle CCTP. Compare transfer speeds, fees and recovery options.",
  alternates: { canonical: "https://www.cctp.io/" },
  openGraph: {
    title: "CCTP Bridge — Bridge Native USDC | CCTP.io",
    description: "Bridge native USDC across EVM and Solana. Compare Fast and Standard transfers, fees and recovery options.",
    url: "https://www.cctp.io/", siteName: "CCTP.io", type: "website",
    images: [{ url: "https://www.cctp.io/og.png", width: 1000, height: 525, alt: "CCTP Bridge" }],
  },
};

export default function HomePage() {
  return (
    <main className="cctp-theme min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org", "@type": "WebSite",
        name: "CCTP.io", alternateName: "CCTP Bridge", url: "https://www.cctp.io/",
        description: "Independent interface for bridging native USDC with Circle CCTP.",
      }).replace(/</g, "\\u003c") }} />
      <BridgePageShell homepage>
        <Suspense fallback={<BridgeCardSkeleton />}>
          <HomeClientPage />
        </Suspense>
      </BridgePageShell>
      <HomepageContent />
    </main>
  );
}
