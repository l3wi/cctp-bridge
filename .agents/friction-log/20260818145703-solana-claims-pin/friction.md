---
title: 'Solana claims pin a single public RPC and treat browser Failed-to-fetch as fatal'
severity: 'major'
---

### Expected Behavior

Arbitrum to Solana claims should still construct receiveMessage when a public Solana RPC is CORS-blocked or temporarily unreachable.

### Current Behavior

useMint used a single ConnectionProvider endpoint with no rotating fetch. fetchFeeRecipient only fell back on HTTP 403. In the browser a blocked getAccountInfo for the TokenMessenger PDA surfaces as TypeError: Failed to fetch, so the claim dies after Circle attestation is already complete.

### Possible Solution

Share getSolanaConnectionOptions with ConnectionProvider, and treat Failed to fetch as eligible for the verified TokenMessenger feeRecipient fallback.

### Minimal Reproducible Example

1. Burn USDC on Arbitrum to Solana (CCTP domain 5).
2. Wait for Iris status complete.
3. Connect a Solana wallet and click Claim.
4. Observe Claim failed: Failed to fetch feeRecipient from TokenMessenger ... TypeError: Failed to fetch.

### Context

User burn 0x243ba2046ba2b520564c21bfc47cbfca6e72cbd120c26dff479b3aae47148f44 is attested complete for dest domain 5 but the claim UI showed this error.
