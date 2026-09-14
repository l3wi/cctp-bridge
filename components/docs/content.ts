import type { Metadata } from "next";

export const docsOrigin = "https://www.cctp.io";
export const routeGuides = [
  { slug: "ethereum-to-base", source: "Ethereum", destination: "Base", sourceGas: "ETH", destinationGas: "ETH", sourceIcon: "1", destinationIcon: "8453", crossEcosystem: false },
  { slug: "base-to-ethereum", source: "Base", destination: "Ethereum", sourceGas: "ETH", destinationGas: "ETH", sourceIcon: "8453", destinationIcon: "1", crossEcosystem: false },
  { slug: "ethereum-to-solana", source: "Ethereum", destination: "Solana", sourceGas: "ETH", destinationGas: "SOL", sourceIcon: "1", destinationIcon: "solana", crossEcosystem: true },
  { slug: "solana-to-base", source: "Solana", destination: "Base", sourceGas: "SOL", destinationGas: "ETH", sourceIcon: "solana", destinationIcon: "8453", crossEcosystem: true },
] as const;
export type RouteGuide = (typeof routeGuides)[number];
export const docsNavigation = [
  { title: "Get started", links: [
    { label: "How it works", href: "/docs/how-it-works" },
    { label: "Fast & Standard transfers", href: "/docs/how-it-works#transfer-speed" },
    { label: "Fees and transfer times", href: "/docs/fees" },
  ] },
  { title: "Route guides", links: [
    { label: "All route guides", href: "/docs/routes" },
    ...routeGuides.map((route) => ({ label: `${route.source} → ${route.destination}`, href: `/docs/routes/${route.slug}` })),
  ] },
  { title: "Help", links: [
    { label: "Track or resume a transfer", href: "/docs/recover" },
    { label: "Common questions", href: "/docs/recover#questions" },
  ] },
];
export function docsMetadata(title: string, description: string, path: string): Metadata {
  return { title: `${title} | CCTP Bridge`, description, alternates: { canonical: `${docsOrigin}${path}` }, openGraph: { title: `${title} | CCTP Bridge`, description, url: `${docsOrigin}${path}`, type: "article" } };
}
