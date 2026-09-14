import Link from "next/link";
import { DocsArticle } from "@/components/docs/docs-article";
import { routeGuides, docsMetadata } from "@/components/docs/content";

export const metadata = docsMetadata("USDC route guides", "Learn the wallet, gas and transfer requirements for native USDC routes across Ethereum, Base and Solana using CCTP.", "/docs/routes");
export default function RoutesPage() {
  return <DocsArticle title="Route guides" category="Route guides" description="Start with the network your USDC is on. Each guide covers the wallets, gas, and steps needed to reach your destination." sections={[
    { id: "guides", title: "Choose a route", content: <div className="divide-y divide-border">{routeGuides.map((route) => <Link key={route.slug} href={`/docs/routes/${route.slug}`} className="group flex items-center justify-between gap-4 py-5 first:pt-1"><span><strong className="group-hover:text-docs-link">{route.source} → {route.destination}</strong><span className="block text-sm">{route.crossEcosystem ? "EVM and Solana wallets" : "EVM wallet"} · {route.sourceGas} on {route.source}, {route.destinationGas} on {route.destination}</span></span><span aria-hidden className="text-docs-link">→</span></Link>)}</div> },
    { id: "other-networks", title: "Looking for another network?", content: <p>These guides cover a selection of routes. Open the bridge to see the networks and transfer modes currently available in your environment. Choose native USDC, check both gas balances, and review the quote before sending.</p> },
  ]} />;
}
