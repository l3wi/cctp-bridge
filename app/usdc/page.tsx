import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getUsdcChains, getUsdcRoutes } from "@/lib/usdcRoutes";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "Native USDC bridge routes | CCTP Bridge",
  description: "Choose your source and destination networks to bridge native USDC with CCTP. Compare route-specific confirmations, wallets, gas and transfer requirements.",
  alternates: { canonical: "https://www.cctp.io/usdc" },
};
export default function UsdcRoutesPage() {
  const routes = getUsdcRoutes();
  return <main className="cctp-theme min-h-screen bg-background text-foreground">
    <SiteHeader active="bridge" />
    <div className="mx-auto max-w-[968px] px-6 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Native USDC bridge routes</h1>
      <p className="mt-4 mb-10 text-muted-foreground">Choose the network your USDC is on, then select where you want to send it.</p>
      <Accordion type="multiple" className="[&_[role=region][data-state=closed]]:hidden">
        {getUsdcChains().map((chain) => <AccordionItem key={chain.slug} value={chain.slug}>
          <AccordionTrigger>Bridge USDC from {chain.name}</AccordionTrigger>
          <AccordionContent forceMount>
            <ul className="grid gap-3 sm:grid-cols-2">
              {routes.filter((route) => route.source.slug === chain.slug).map((route) => <li key={route.path}><Link href={route.path} className="text-link hover:underline">{chain.name} to {route.destination.name}</Link></li>)}
            </ul>
          </AccordionContent>
        </AccordionItem>)}
      </Accordion>
    </div>
  </main>;
}
