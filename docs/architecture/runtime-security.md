# Runtime security baseline

Next.js and eslint-config-next are pinned to 16.4.1. This includes fixes for GHSA-673q-mjm6-r5xr (React Server Components remote code execution), GHSA-2464-fhr4-w9xw / CVE-2026-96889 (SVG image optimization remote code execution), and GHSA-p3m5-59mp-jv5r (Server Actions denial of service). The resolved sharp must be at least 0.35.5.

The deployment remains on Node.js 22; package.json requires ^22.23.4 and .nvmrc selects 22.23.4. Hosts must actually supply 22.23.4 or a newer 22.x patch. Setting engines does not install a runtime or prove the deployed runtime is patched. Local Node 24 installations require 24.22.1 or later.

Sources:
- https://nextjs.org/blog/nextjs-security-update-october-14-2026
- https://nodejs.org/en/blog/vulnerability/october-2026-security-releases

Validate the resolved Next.js and sharp versions, run TypeScript checks and deterministic tests, and rebuild before deployment. Deployment and host runtime verification are separate release steps.
