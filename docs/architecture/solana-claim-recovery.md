# Solana claim recovery

`useMintPolling` checks Circle for a completed burn targeting Solana until its attestation becomes ready, the transfer completes, or expiration recovery takes over. Transfer age does not disable these checks. Existing visibility gating skips requests in hidden tabs, and polling is cleaned up on unmount.

`executeSolanaMint` forces a fresh attestation lookup for each explicit Claim attempt so a cached failed or pending response cannot block a retry. An unavailable lookup is described as processing or a possible request failure: Iris currently returns `null` for both absent messages and failed requests.

Recipient validation, nonce checks, expiration checks, account creation, and wallet signing remain part of the existing claim flow. This change does not submit transactions automatically.

Regression coverage verifies that a day-old transfer advances from pending to ready and stops polling, and that an explicit Solana claim bypasses the lookup cache and reports unavailable data honestly.
