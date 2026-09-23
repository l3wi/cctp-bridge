import { getUsdcRoutes } from "@/lib/usdcRoutes";
import type { MetadataRoute } from "next";
import { docsOrigin, routeGuides } from "@/components/docs/content";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/usdc", ...getUsdcRoutes().map((route) => route.path), "/docs/how-it-works", "/docs/transfer-speed", "/docs/fees", "/docs/about", "/docs/recover", "/docs/routes", ...routeGuides.map((route) => `/docs/routes/${route.slug}`)].map((path) => ({ url: `${docsOrigin}${path}` }));
}
