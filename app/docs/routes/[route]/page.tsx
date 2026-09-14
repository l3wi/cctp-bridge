import { notFound } from "next/navigation";
import { routeGuides, docsMetadata } from "@/components/docs/content";
import { RouteGuideArticle } from "@/components/docs/route-guide";

export const dynamicParams = false;
export function generateStaticParams() { return routeGuides.map(({ slug }) => ({ route: slug })); }
export async function generateMetadata({ params }: { params: Promise<{ route: string }> }) {
  const { route: slug } = await params;
  const route = routeGuides.find((guide) => guide.slug === slug);
  if (!route) notFound();
  return docsMetadata(`Bridge USDC from ${route.source} to ${route.destination}`, `How to bridge native USDC from ${route.source} to ${route.destination}: wallets, gas, transfer speed, fees and recovery.`, `/docs/routes/${route.slug}`);
}
export default async function RoutePage({ params }: { params: Promise<{ route: string }> }) {
  const { route: slug } = await params;
  const route = routeGuides.find((guide) => guide.slug === slug);
  if (!route) notFound();
  return <RouteGuideArticle route={route} />;
}
