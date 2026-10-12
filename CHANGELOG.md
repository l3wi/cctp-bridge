# Changelog

## Unreleased

- Fixed stale Solana transfer recovery: pending attestations keep polling beyond one hour, and Claim refreshes Circle data with retry guidance for unavailable lookups.

- Updated Circle Bridge Kit to 1.15.1, adding SDK metadata for Arc mainnet alongside Arc Testnet, with public route pages for Arc and Plasma. Production builds regenerate chain metadata and validated RPC candidates.

- Removed Standard bridge message signing while retaining cumulative fees and fee confirmation. Quotes no longer lock wallets, and receipt ownership is verified before recording transaction hashes.

- Redesigned the bridge interface and added documentation for transfer speeds, route guides, and recovery.
