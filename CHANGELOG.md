# Changelog

## Unreleased

- Updated Next.js and its ESLint configuration to 16.4.1 for the October security fixes, including patched React Server Components and sharp. Required Node.js 22.23.4 or later within 22.x and added `.nvmrc`.

- Fixed stale Solana transfer recovery: pending attestations keep polling beyond one hour, and Claim refreshes Circle data with retry guidance for unavailable lookups.

- Updated Circle Bridge Kit to 1.15.1, adding SDK metadata for Arc mainnet alongside Arc Testnet, with public route pages for Arc and Plasma. Production builds regenerate chain metadata and validated RPC candidates.

- Removed Standard bridge message signing while retaining cumulative fees and fee confirmation. Quotes no longer lock wallets, and receipt ownership is verified before recording transaction hashes.

- Redesigned the bridge interface and added documentation for transfer speeds, route guides, and recovery.
