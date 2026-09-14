import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  // Utilities stay crawlable so search engines can read their noindex metadata.
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://www.cctp.io/sitemap.xml",
  };
}
