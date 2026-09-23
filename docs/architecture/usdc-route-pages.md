# Directional USDC route pages

## Public URL and data contract

`/usdc/{source}/{destination}` is a marketing/bridge entry point. `/usdc` is the crawlable directory. Existing `/bridge` utility and transaction-detail URLs retain their noindex policy. The homepage remains unchanged.

`lib/usdcRoutes.ts` owns stable chain slugs, supported mainnet chain records, directed route pairs, and FAQs. Unknown, unsupported, same-network, and testnet routes are not generated. Sources and destinations are ordered: reversing them changes the gas, wallet, source confirmation, and attestation requirements.

Route pages render titles, self-canonicals, descriptions, and FAQs on the server. Each also emits a JSON-LD graph containing WebPage, BreadcrumbList, and FAQPage, with canonical identifiers and the same FAQ data used by the visible accordion. The serializer escapes HTML opening brackets to prevent script termination. Each route uses the same confirmation/finality configuration as the bridge. Estimates describe source attestation rather than guaranteed destination settlement. Never fabricate confirmation or timing values when configuration is unavailable. Changes to chain support must update catalog tests.

## Form initialization and execution boundary

The route widget passes only `initialChains` into `BridgeCard` in `intentOnly` mode. Amount and recipient are not supplied by the landing page; viewing a route does not invoke execution. Explicit form submission uses the existing validated execution-intent flow. Wallet connection must not silently overwrite the route source. Changing the route remounts the widget with a clean form.

## Layout and discovery

The shared page shell supports optional title/subtitle overrides; unchanged callers retain their existing presentation. Route pages contain the centred bridge above the fold and direction-specific FAQs and reverse-route links below it. The directory exposes links for every supported pair in server HTML. Sitemap entries include public routes, never amount/recipient query variants or transaction URLs.

Existing editorial route guides remain separate instructional pages and link directly to the matching prefilled route. Do not clone their full article body into the landing page. The landing page provides the tool and configuration-driven answers; the guide supplies the detailed walkthrough.

## Validation and rollout

Verify mainnet pair coverage, slug uniqueness, invalid-route rejection, source-based FAQ values, and safe prefill with a mismatched connected wallet. Inspect server HTML for canonical and FAQ content, and manually check Solana/EVM selection without submitting a transaction. Monitor Search Console for route impressions and duplicate-page selection after deployment. All-pair generation enables product navigation; ranking gains are not assumed.
