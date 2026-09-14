"use client";

import { ChangelogModal } from "@/components/changelog-modal";
import { SolanaWalletConnect } from "@/components/solana-wallet-connect";
import { WalletConnect } from "@/components/wallet-connect";

export function BridgeShellActions({ inline = false }: { inline?: boolean }) {
  return (
    <div className={inline ? "flex flex-wrap items-center justify-end gap-3" : "absolute right-4 top-4 z-20 flex items-center gap-2"}>
      <ChangelogModal navbar={inline} />
      <SolanaWalletConnect navbar={inline} />
      <WalletConnect navbar={inline} />
    </div>
  );
}
