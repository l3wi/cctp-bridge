import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { docsMetadata } from "@/components/docs/content";

describe("public indexing policy", () => {
  it("lists only canonical public pages and leaves utilities crawlable for noindex", () => {
    const entries = sitemap();
    expect(new Set(entries.map((entry) => entry.url)).size).toBe(entries.length);
    for (const entry of entries) {
      const url = new URL(entry.url);
      expect(url.origin).toBe("https://www.cctp.io");
      expect(url.search).toBe("");
      expect(url.pathname === "/" || url.pathname.startsWith("/docs/")).toBe(true);
    }
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/" });
    expect(robots().sitemap).toBe("https://www.cctp.io/sitemap.xml");
  });
  it("gives each guide its own canonical and social URL", () => {
    const metadata = docsMetadata("Fees", "Transfer costs", "/docs/fees");
    expect(metadata.alternates?.canonical).toBe("https://www.cctp.io/docs/fees");
    expect(metadata.openGraph?.url).toBe("https://www.cctp.io/docs/fees");
  });
});
