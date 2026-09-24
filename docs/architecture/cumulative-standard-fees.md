# Cumulative Standard fees

Standard bridges pay 100 USDC when a wallet reaches each cumulative 1,000,000 USDC band. Volume is the entered gross USDC amount. Fast bridges and their existing fees are excluded. EVM addresses are case-normalized and shared across chains; Solana addresses retain case. There is no linkage between different wallet addresses owned by the same person.

## Existing balances and activation

Migration 0003 snapshots current Standard statistics into `standard_fee_accounts`. Every account initially has a 1m threshold, irrespective of its historical volume. An existing 18.8m account pays just 100 USDC on its next Standard bridge. After that payment the next threshold is the next whole million above its resulting volume. An existing 900k account bridging 100k pays 100 USDC. A chargeable transfer must exceed 100 USDC so a positive amount remains to burn.

Apply the migration with `bun --env-file=.env.local run db:migrate` during the production cutover. Coordinate the snapshot with switching traffic to this version: old application instances do not update the fee ledger. Do not run migrations against a live database merely to test this feature. Existing totals are imported as requested, and remain subject to the accuracy of the original submission telemetry; new ledger updates require on-chain verification.

## Request and payment lifecycle

The burn hook requests a fee quote using the address, chain, amount, request ID and timestamp. Standard bridges require no wallet message signature. Quotes are nonexclusive and never lock an address: an unsigned request cannot prevent another wallet from bridging. Wallet authorization comes from the actual on-chain transaction.

`POST /api/fees/standard` returns `chargeFee`, `feeAtomic`, recipient and a private reservation token. The hook uses only that response to add the cumulative fee. The quote is saved before building/approving the burn and marked broadcasting before submission. No account lock is acquired. Fast burns bypass this API.

Both EVM and Solana collect the fee atomically with the burn. Circle's EVM bridge routes 90 USDC of the 100 USDC charge to the application recipient and retains 10 USDC. Solana routes all 100 USDC to the configured recipient. `fees_paid_atomic` records the full fee paid by the user, not net project revenue.

The browser saves recovery information before broadcasting and the hash immediately after submission. Posting the hash does not block bridge progress. Before storing it, the server verifies that an observed receipt matches the quote, including its signer. An unobserved hash remains in browser recovery storage and receipt polling retries submission. An EVM receipt awaiting Standard confirmations marks it `submitted`, without crediting volume or fees. Existing burn-receipt polling also requests nonblocking server reconciliation. The server verifies chain, signer, USDC, burn amount, Standard finality and the fee transfer. EVM verification waits the chain's configured Standard confirmations; Solana uses finalized transactions. Only then does a transactional, idempotent update advance cumulative volume, fees paid and the next threshold. Reverted transactions release the account without advancing totals. The existing statistics endpoint remains best-effort and does not credit the billing ledger.

Cancellation is allowed before broadcast or after an explicit wallet rejection. Broadcasting or submitted reservations do not expire automatically: a slow transaction might still succeed. Reconciliation is attempted on submission and when the account next requests a bridge. Unsettled requests do not block the address. The same browser retains an unobserved hash and asks the user to retry until it can safely hand recovery to the server.

## Recovery and enforcement boundary

Known hashes are retried from browser storage before the next Standard bridge. A broadcast whose hash was never returned, or loss of browser recovery state, needs operator reconciliation: locate the transaction on the recorded source chain and submit its hash with the reservation token through the API. Do not clear the reservation based only on elapsed time. Investigate verification mismatches before changing ledger data.

This enforces payment in the application's construction flow. Public CCTP contracts still permit direct transfers, and different addresses have separate balances. Browser flags cannot enforce fees against users constructing their own transactions. Quotes use settled volume. Concurrent transfers may receive the same fee quote: they can defer a threshold charge to the next transfer or each pay a fee quoted before another settles. This is not strict serialization; that would require authenticated reservations or on-chain enforcement. Receipt hashes remain unique per source chain, and settlement advances thresholds monotonically.

## Validation

Local SQLite ledger tests cover historical seeding, threshold crossing, idempotency, nonblocking quotes, invalid hash claims, pending/failed receipts and cancellation. Burn-hook tests cover API-gated fee inclusion and failure to quote. Live mainnet transfers and deployment are separate release steps.
# Fee confirmation UI

Clicking Bridge first requests a Standard fee preview. The server reconciles any previous burn and reloads the ledger before quoting. The preview uses verified settled volume; pending or invalid requests do not block quoting. When a fee is due, a modal shows the wallet’s cumulative Standard volume, gross amount, fee and net amount received. Confirm starts the transaction approval and bridge flow; closing or cancelling does not send anything. The quote rechecks the fee and aborts for a fresh review if it differs from the preview. No fee notice is displayed on the normal bridge form.
