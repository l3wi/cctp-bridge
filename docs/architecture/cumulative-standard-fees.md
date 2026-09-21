# Cumulative Standard fees

Standard bridges pay 100 USDC when a wallet reaches each cumulative 1,000,000 USDC band. Volume is the entered gross USDC amount. Fast bridges and their existing fees are excluded. EVM addresses are case-normalized and shared across chains; Solana addresses retain case. There is no linkage between different wallet addresses owned by the same person.

## Existing balances and activation

Migration 0003 snapshots current Standard statistics into `standard_fee_accounts`. Every account initially has a 1m threshold, irrespective of its historical volume. An existing 18.8m account pays just 100 USDC on its next Standard bridge. After that payment the next threshold is the next whole million above its resulting volume. An existing 900k account bridging 100k pays 100 USDC. A chargeable transfer must exceed 100 USDC so a positive amount remains to burn.

Apply the migration with `bun --env-file=.env.local run db:migrate` during the production cutover. Coordinate the snapshot with switching traffic to this version: old application instances do not update the fee ledger. Do not run migrations against a live database merely to test this feature. Existing totals are imported as requested, and remain subject to the accuracy of the original submission telemetry; new ledger updates require on-chain verification.

## Request and payment lifecycle

The burn hook signs a wallet message binding address, chain, amount, request ID and timestamp. The server verifies that signature before reserving an account, preventing other users from reserving arbitrary wallet balances. This adds one message-signing request to Standard bridges and requires Solana wallets to support `signMessage`.

`POST /api/fees/standard` returns `chargeFee`, `feeAtomic`, recipient and a private reservation token. The hook uses only that response to add the cumulative fee. A database write transaction allows one active Standard bridge per address, including zero-fee bridges. The amount is reserved before building/approving the burn, and the reservation is marked broadcasting before submission. Fast burns bypass this API.

Both EVM and Solana collect the fee atomically with the burn. Circle's EVM bridge routes 90 USDC of the 100 USDC charge to the application recipient and retains 10 USDC. Solana routes all 100 USDC to the configured recipient. `fees_paid_atomic` records the full fee paid by the user, not net project revenue.

The browser saves recovery information before broadcasting and the hash immediately after submission. Posting the hash does not block bridge progress or mark the reservation sent: it remains `broadcasting` until the server observes an on-chain receipt. An EVM receipt awaiting Standard confirmations marks it `submitted`, without crediting volume or fees. Existing burn-receipt polling also requests nonblocking server reconciliation. The server verifies chain, signer, USDC, burn amount, Standard finality and the fee transfer. EVM verification waits the chain's configured Standard confirmations; Solana uses finalized transactions. Only then does a transactional, idempotent update advance cumulative volume, fees paid and the next threshold. Reverted transactions release the account without advancing totals. The existing statistics endpoint remains best-effort and does not credit the billing ledger.

Cancellation is allowed before broadcast or after an explicit wallet rejection. Broadcasting or submitted reservations do not expire automatically: a slow transaction might still succeed. Reconciliation is attempted on submission and when the account next requests a bridge. Until finality is established, another Standard bridge for that wallet is blocked.

## Recovery and enforcement boundary

Known hashes are retried from browser storage before the next Standard bridge. A broadcast whose hash was never returned, or loss of browser recovery state, needs operator reconciliation: locate the transaction on the recorded source chain and submit its hash with the reservation token through the API. Do not clear the reservation based only on elapsed time. Investigate verification mismatches before changing ledger data.

This enforces payment in the application's construction flow. Public CCTP contracts still permit direct transfers, and different addresses have separate balances. Browser flags cannot enforce fees against users constructing their own transactions. Signature verification currently covers EOA EVM wallets and Ed25519 Solana wallets; smart-contract wallet message validation needs a separate EIP-1271 integration.

## Validation

Local SQLite ledger tests cover historical seeding, threshold crossing, idempotency, active-reservation exclusion, pending/failed receipts and cancellation. Burn-hook tests cover API-gated fee inclusion and failure to quote. Live mainnet transfers and deployment are separate release steps.
# Fee confirmation UI

Clicking Bridge first requests a Standard fee preview. The server reconciles any previous burn and reloads the ledger before quoting. An unsettled reservation blocks the preview rather than displaying a stale fee, including for transfers of 100 USDC or less. When a fee is due, a modal shows the wallet’s cumulative Standard volume, gross amount, fee and net amount received. Confirm starts wallet message signing and the bridge flow; closing or cancelling does not sign or send anything. The signed reservation rechecks the fee and aborts for a fresh review if it differs from the preview. No fee notice is displayed on the normal bridge form.
