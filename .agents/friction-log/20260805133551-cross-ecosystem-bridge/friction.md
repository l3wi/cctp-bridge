---
title: 'Cross-ecosystem bridge flows lack a deterministic smoke test'
severity: 'major'
---

## Expected Behavior
The repository should provide a deterministic smoke or integration harness for EVM-to-EVM, EVM-to-Solana, and Solana-to-EVM route construction, fee handling, and status transitions without requiring an ad hoc wallet session.

## Current Behavior
The package scripts provide unit tests and an optional EVM fork test, but no cross-ecosystem smoke command. The bridge plans still rely on manual wallet and RPC verification checklists for the main route combinations.

## Possible Solution
Add a mocked-provider or fixture-backed smoke harness that exercises each route and the fast/standard fee branches, with an optional live testnet mode behind explicit environment variables.

## Minimal Reproducible Example
List available scripts and the remaining manual route checklist:

```sh
node -e "console.log(require("./package.json").scripts)"
rg -n "Manual QA|EVM.*Solana|Solana.*EVM" docs/tasks/new-bridge-flow.md docs/tasks/solana-bridging.md
```

## Context
Changes to route selection, fee calculation, attestations, and claim handling currently require manual wallet and RPC testing to catch cross-ecosystem regressions.
