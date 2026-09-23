import { describe, expect, it } from "vitest";
import { getUsdcRoute } from "@/lib/usdcRoutes";
import { serializeUsdcRouteStructuredData } from "@/lib/usdcRouteStructuredData";

describe("route JSON-LD", () => {
  it("matches each direction's canonical URL and displayed FAQs", () => {
    for (const [source, destination] of [["solana", "base"], ["base", "solana"]]) {
      const route = getUsdcRoute(source, destination)!;
      const title = `Bridge USDC from ${route.source.name} to ${route.destination.name}`;
      const [page, breadcrumb, faq] = JSON.parse(serializeUsdcRouteStructuredData(route, title))["@graph"];
      expect(page.url).toBe(`https://www.cctp.io${route.path}`);
      expect(page.name).toBe(title);
      expect(page.breadcrumb["@id"]).toBe(breadcrumb["@id"]);
      expect(page.mainEntity["@id"]).toBe(faq["@id"]);
      expect(breadcrumb.itemListElement[1].item).toBe(page.url);
      expect(faq.mainEntity.map((entry: { name: string; acceptedAnswer: { text: string } }) => ({ question: entry.name, answer: entry.acceptedAnswer.text }))).toEqual(route.faqs);
    }
  });

  it("prevents FAQ text from terminating the JSON-LD script", () => {
    const route = getUsdcRoute("solana", "base")!;
    const answer = "</script><script>alert(1)</script>";
    const serialized = serializeUsdcRouteStructuredData({ ...route, faqs: [{ question: "Example", answer }] }, "Example");
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)["@graph"][2].mainEntity[0].acceptedAnswer.text).toBe(answer);
  });
});
