import type { MetadataRoute } from "next";
import { docsOrigin, routeGuides } from "@/components/docs/content";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/docs/how-it-works", "/docs/fees", "/docs/recover", "/docs/routes", ...routeGuides.map((route) => `/docs/routes/${route.slug}`)].map((path) => ({ url: `${docsOrigin}${path}` }));
}
