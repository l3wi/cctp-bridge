# Search indexing and public content

Public entry points use the established https://www.cctp.io host. The homepage owns its canonical; guides each own their canonical through docsMetadata. Never place a homepage canonical in the root layout, where it would be inherited by unrelated pages.

The sitemap lists public editorial URLs only. Find-transfer and transaction detail routes inherit noindex from app/bridge/layout.tsx; history and the HTML social-image preview are also noindex. robots.txt permits crawling so these directives can be read. Noindex is not access control.

Transaction paths are validated using the existing source and transaction/nonce parsers before rendering. Valid pending transactions are not rejected just because an external attestation is not yet available. Malformed paths return notFound.

Visible homepage content preserves CCTP Bridge positioning. WebSite markup describes an independent interface, without ratings or Circle endorsement. Social metadata uses the existing image. Do not synthesize last-modified dates, performance claims, or completion statistics.

Validation: inspect raw server HTML for canonical and robots metadata; check malformed paths, robots.txt and sitemap.xml against the dev server. Production Search Console and field performance verification follow deployment.
