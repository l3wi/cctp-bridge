---
title: 'Bridge Kit cutover documentation is stale about Solana scope'
severity: 'minor'
---

## Expected Behavior
The canonical Bridge Kit plan should describe the current supported scope: EVM↔EVM, EVM→Solana, and Solana→EVM, with Solana↔Solana explicitly marked as unsupported if that remains intentional.

## Current Behavior
`docs/tasks/bridge-kit-cutover.md` still describes the current repository as EVM-only, says Solana support is deferred, and presents Solana adapter wiring as future work. The active code already includes Solana chain metadata, the unified burn/mint hooks, and cross-ecosystem orchestration.

## Possible Solution
Update or archive the cutover plan so its scope, current implementation state, and remaining Solana↔Solana limitation match the active code.

## Minimal Reproducible Example
Compare the plan with:

```sh
rg -n "EVM-only|Solana|Current Repo State" docs/tasks/bridge-kit-cutover.md
rg -n "Solana|useCrossEcosystemBridge" lib/bridgeConfig.ts lib/hooks/useCrossEcosystemBridge.ts
```

## Context
An agent following the plan can incorrectly disable or reimplement working Solana paths, and release or review decisions can be based on an obsolete scope statement.
