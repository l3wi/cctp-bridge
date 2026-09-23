---
title: 'Synpress wallet onboarding drops words with MetaMask 13.13.1'
severity: 'minor'
---

### Expected Behavior
Import public Anvil mnemonic reliably for local-fork wallet tests.
### Current Behavior
Synpress 4.1.2 importWallet types into MetaMask 13.13.1 at 10ms per key; only 10 of 12 words appeared and Continue stayed disabled.
### Possible Solution
Use Playwright fill or paste for disposable-wallet onboarding.
### Minimal Reproducible Example
Call importWallet with the public default Anvil mnemonic in a fresh profile.
### Context
Cumulative Standard fee fork smoke testing. No production wallets involved.
