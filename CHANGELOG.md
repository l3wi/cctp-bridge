# Changelog

## Unreleased

- Fixed automatic-claim quote changes interrupting approval: show an explicit fee ceiling, tolerate small price changes within it, and provide a direct fee-review action when the ceiling is exceeded.

- Added automatic claims through Circle Forwarding Service on supported EVM and Solana routes, enabled by default with a delivery-mode toggle. Transfer quotes include forwarding fees, and progress tracking continues until the destination mint is confirmed. Arc Max now reserves USDC for approval and bridge gas.

- Improved Solana claim reliability with automatic recovery from unavailable network providers. Slow status checks no longer pile up, and failed balance refreshes keep the last known balance instead of showing zero.

- Fixed unresolved Standard transfers blocking later bridges and improved recovery of pending transfers.

- Applied security fixes to the bridge website.

- Fixed stale Solana transfer recovery: pending attestations keep polling beyond one hour, and Claim refreshes Circle data with retry guidance for unavailable lookups.

- Added Arc mainnet support and public route guides for Arc and Plasma.

- Removed message signing for Standard transfers while retaining cumulative fees and fee confirmation.

- Redesigned the bridge interface and added documentation for transfer speeds, route guides, and recovery.
