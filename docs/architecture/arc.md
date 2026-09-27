# Arc chain integration

Circle Bridge Kit 1.15.1 supplies Arc mainnet (chain ID 5042) and Arc Testnet (5042002), both using CCTP domain 26. Environment filtering selects the appropriate entry; the app does not maintain a separate Arc allowlist.

Execution continues through the custom EVM CCTP library. App fees use the SDK-provided Circle bridge address and `bridgeWithPreapproval`; Standard fee settlement verifies the burn and fee transfer receipt. Circle Fast fees are fetched for the source/destination domain pair. No fee policy changes accompany this SDK upgrade.

`metadata:refresh` generates both chain metadata and validated RPC candidates. The EVM RPC router reads the separate RPC artifact, so generating CCTP metadata alone is insufficient. Production builds run the full refresh.

Release validation checks RPC coverage, TypeScript, and existing bridge/fee tests. A real Arc transfer and its fee receipt remain a separate end-to-end verification; SDK metadata and passing unit tests do not prove settlement.
