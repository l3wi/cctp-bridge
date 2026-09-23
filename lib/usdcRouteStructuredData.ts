import type { UsdcRoute } from "@/lib/usdcRoutes";

export function serializeUsdcRouteStructuredData(route: UsdcRoute, title: string) {
  const origin = "https://www.cctp.io";
  const url = `${origin}${route.path}`;
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        breadcrumb: { "@id": `${url}#breadcrumb` },
        mainEntity: { "@id": `${url}#faq` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "USDC routes", item: `${origin}/usdc` },
          { "@type": "ListItem", position: 2, name: `${route.source.name} to ${route.destination.name}`, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: route.faqs.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ],
  }).replace(/</g, "\\u003c");
}
