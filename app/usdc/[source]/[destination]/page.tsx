import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { getUsdcRoute, getUsdcRoutes } from "@/lib/usdcRoutes";
import { serializeUsdcRouteStructuredData } from "@/lib/usdcRouteStructuredData";
import { BridgePageShell } from "@/components/bridge-page-shell";
import { BridgeCardSkeleton } from "@/components/bridge-card-skeleton";
import { UsdcRouteBridge } from "@/components/usdc-route-bridge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface Props { params: Promise<{ source: string; destination: string }> }
const origin = "https://www.cctp.io";
export const dynamicParams = false;
export function generateStaticParams() {
  return getUsdcRoutes().map((route) => ({ source: route.source.slug, destination: route.destination.slug }));
}
async function resolveRoute(params: Props["params"]) {
  const { source, destination } = await params;
  const route = getUsdcRoute(source, destination);
  if (!route) notFound();
  return route;
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const route = await resolveRoute(params);
  const title = `Bridge USDC from ${route.source.name} to ${route.destination.name} | CCTP Bridge`;
  const description = `Bridge native USDC from ${route.source.name} to ${route.destination.name}. Review CCTP confirmation requirements, transfer speeds, gas and fees with the route preselected.`;
  return { title, description, alternates: { canonical: `${origin}${route.path}` }, openGraph: { title, description, url: `${origin}${route.path}`, siteName: "CCTP.io", type: "website", images: [{ url: `${origin}/og.png`, width: 1000, height: 525 }] } };
}
export default async function RoutePage({ params }: Props) {
  const route = await resolveRoute(params);
  const title = `Bridge USDC from ${route.source.name} to ${route.destination.name}`;
  return <main className="cctp-theme min-h-screen bg-background text-foreground">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeUsdcRouteStructuredData(route, title) }} />
    <BridgePageShell homepage title={title} subtitle={`Native USDC from ${route.source.name} to ${route.destination.name}, powered by Circle CCTP.`}>
      <Suspense fallback={<BridgeCardSkeleton />}>
        <UsdcRouteBridge key={route.path} sourceChainId={route.source.chainId} targetChainId={route.destination.chainId} />
      </Suspense>
    </BridgePageShell>
    <section className="border-t border-border bg-surface" aria-labelledby="route-help">
      <div className="mx-auto max-w-[968px] px-6 py-12">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-link"><Link href="/usdc">USDC routes</Link> / {route.source.name} to {route.destination.name}</nav>
        <h2 id="route-help" className="mb-5 text-2xl font-semibold">Using CCTP from {route.source.name} to {route.destination.name}</h2>
        <p className="mb-8 text-base leading-7 text-muted-foreground">Start with native USDC on {route.source.name}. Enter an amount, verify the receiving wallet on {route.destination.name}, and review the quote before signing. A source burn, Circle attestation, and destination mint complete the transfer.</p>
        <Accordion type="single" collapsible defaultValue="faq-0">
          {route.faqs.map((faq, index) => <AccordionItem key={faq.question} value={`faq-${index}`}><AccordionTrigger>{faq.question}</AccordionTrigger><AccordionContent><p className="text-sm leading-6 text-muted-foreground">{faq.answer}</p></AccordionContent></AccordionItem>)}
        </Accordion>
        <nav aria-label="Related routes and guides" className="mt-8 flex flex-wrap gap-6 text-sm text-link">
          <Link href={`/usdc/${route.destination.slug}/${route.source.slug}`}>Reverse route: {route.destination.name} to {route.source.name}</Link>
          <Link href="/usdc">All routes</Link><Link href="/docs/fees">Fee details</Link><Link href="/docs/recover">Transfer recovery</Link>
        </nav>
      </div>
    </section>
  </main>;
}
