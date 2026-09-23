---
title: 'Unsupported Solana cross-cluster routes are not clearly blocked'
severity: 'major'
---

## Expected Behavior
The bridge form should either omit Solana devnet↔mainnet routes or label them as unsupported before submission, with a clear user-facing explanation.

## Current Behavior
The task documentation marks Solana devnet↔mainnet as not implemented, but `buildDestinationOptionsBySource` only excludes an identical chain ID. It can therefore expose the other Solana environment as a destination, leaving unsupported-route handling to downstream code.

## Possible Solution
Encode supported source/destination pairs in one route capability helper and use it for destination options, validation, and submission guards.

## Minimal Reproducible Example
Inspect the route filtering and documented limitation:

```sh
rg -n "buildDestinationOptionsBySource|option.id !== source.id" components/bridge-card/utils.ts
rg -n "Solana to Solana|not implemented|cross-cluster" docs/tasks/solana-bridging.md
```

## Context
A user can select a route that the project itself says is unavailable, creating a late failure instead of a predictable form-level explanation.
