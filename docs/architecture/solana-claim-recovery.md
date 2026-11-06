# Solana claim recovery

`useMintPolling` checks Circle for a completed burn targeting Solana until its attestation becomes ready, the transfer completes, or expiration recovery takes over. Transfer age does not disable these checks. Existing visibility gating skips requests in hidden tabs, and polling is cleaned up on unmount.

`executeSolanaMint` forces a fresh attestation lookup for each explicit Claim attempt so a cached failed or pending response cannot block a retry. An unavailable lookup is described as processing or a possible request failure: Iris currently returns `null` for both absent messages and failed requests.

Recipient validation, nonce checks, expiration checks, account creation, and wallet signing remain part of the existing claim flow. This change does not submit transactions automatically.

Regression coverage verifies that a day-old transfer advances from pending to ready and stops polling, and that an explicit Solana claim bypasses the lookup cache and reports unavailable data honestly.

## RPC failover

Solana wallet connections, claim construction, nonce checks, and balance helpers use the shared connection factory in `lib/rpc/clients.ts`. Mainnet HTTP requests try these providers in order:

1. `https://solana-rpc.publicnode.com`
2. `https://public.rpc.solanavibestation.com`
3. `https://solana-mainnet.gateway.tatum.io`
4. `https://solana.web3cdn.rest`

The runtime fallback list in `lib/rpc/config.ts` and the metadata generator's `DEFAULT_SOLANA_RPCS` contain the same providers. Regenerating metadata does not restore `api.mainnet-beta.solana.com`, which returned `403 Access forbidden` during claim recovery.

Each request can try every configured provider once, skipping providers in cooldown when another is available. Each dispatched attempt has a 10-second deadline covering both the fetch and response body; queueing does not consume that deadline. Network failures, timeouts, HTTP 403/408/429/5xx, and equivalent transient JSON-RPC failures advance to the next available provider. JSON-RPC failures are inspected even when HTTP status is 200. Caller cancellation and non-retryable errors stop immediately; exhaustion preserves the final provider failure.

Failover applies to HTTP JSON-RPC, not WebSocket subscriptions. Claim confirmation uses HTTP signature-status polling.

On 2026-11-06, all four endpoints accepted browser account reads from `https://www.cctp.io` and unsigned simulation of the reported Injective-to-Solana claim. A live smoke scenario forced the first three providers to fail and successfully built and simulated that claim through Web3CDN. No transaction was signed or broadcast. Public access and quotas can change; these checks do not establish an uptime guarantee or successful real transaction submission.


## Traffic budget and backpressure

`lib/rpc/solanaScheduler.ts` shares one HTTP budget across wallet-provider connections and connections created for balances, transaction preparation, submission, and confirmation. Requests start at least 334 ms apart: at most three starts in any second, with no burst allowance. Failover attempts consume the same budget. At most two attempts remain in flight, including response-body reads.

Transient failures put the endpoint into cooldown. The initial delay is one second for network/server failures, five seconds for rate limits, and 60 seconds for forbidden responses. Repeated failures exponentially increase the delay up to 60 seconds, plus up to 249 ms of jitter. A readable `Retry-After` header, expressed as seconds or an HTTP date, can extend cooldown beyond that backoff. Browsers may hide this header unless the provider exposes it through CORS; the local backoff still applies.

Queued requests select a provider at dispatch time so they respect cooldowns discovered by other requests. Available requests proceed without waiting behind a request whose providers are all cooling down. A request waits at most 15 seconds for each dispatch slot before reporting that providers are busy, rather than accumulating an indefinite backlog. Caller cancellation removes queued work immediately. The Solana SDK's automatic HTTP 429 retries remain disabled.

Burn polling and manual Solana attestation polling allow only one check in flight, even when a check takes longer than the polling interval. Claim confirmation and ATA-readiness checks already await each read before their next polling delay. Balance queries retain their existing 30-second refresh and 15-second freshness windows, without additional automatic query retries. A failed balance refresh retains cached data and exposes an error; only a genuinely absent USDC token account produces a zero balance.

There is no generic RPC-result cache or transaction deduplication: nonce checks, current chain state, and transaction submission retain their existing semantics. The limiter is local to a JavaScript runtime (normally one browser tab), not shared across tabs, users, or IP addresses. Public-provider quotas can therefore still produce 429 responses.

A browser smoke check from `https://www.cctp.io` completed four balance reads through this local transport after an injected primary-provider 429. Its seven attempts were at least 352 ms apart, with at most two fetches active; no transaction was signed or broadcast. Regression coverage exercises cross-connection pacing, concurrency, cooldown expiry, queued cancellation, bounded waiting, balance refresh failures, and non-overlapping polls.
