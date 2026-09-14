"use client";

import Link from "next/link";
import { useTransactionStore } from "@/lib/store/transactionStore";
import { buildBridgeRoute, getTransactionShareId } from "@/lib/bridgeRoute";
import { getBridgeChainByIdUniversal } from "@/lib/bridgeConfig";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChainIcon } from "@/components/chain-icon";

export function TransferHistory() {
  const transactions = useTransactionStore((state) => state.transactions);
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return (
    <Card className="w-full border-border bg-card text-card-foreground">
      <CardContent className="flex flex-col gap-6 p-5 sm:p-6">
        {sorted.length ? (
          <ul className="flex max-h-[420px] flex-col gap-3 overflow-y-auto" aria-label="Saved transfers">
            {sorted.map((tx) => (
              <li key={tx.hash}>
                <Link href={buildBridgeRoute(tx.originChain, getTransactionShareId(tx))} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 transition-colors hover:bg-secondary">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <ChainIcon chainId={tx.originChain} size={20} />
                    <span>{getBridgeChainByIdUniversal(tx.originChain)?.name ?? tx.originChain}</span>
                    <span aria-hidden="true">→</span>
                    {tx.targetChain && <ChainIcon chainId={tx.targetChain} size={20} />}
                    <span>{tx.targetChain ? getBridgeChainByIdUniversal(tx.targetChain)?.name ?? tx.targetChain : "Destination pending"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{tx.amount ?? "—"} USDC</span>
                    <span className="text-sm text-muted-foreground">{tx.status === "claimed" ? "Completed" : tx.status === "failed" ? "Failed" : "Pending"}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>{tx.hash.slice(0, 10)}…{tx.hash.slice(-6)}</span>
                    <span>{new Date(tx.date).toLocaleDateString()}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <h3 className="font-medium">No transfers saved yet</h3>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">Find a transfer using its source transaction hash, or start a new bridge.</p>
            <Button variant="outline" asChild><Link href="/bridge">Find a transfer</Link></Button>
          </div>
        )}
        {sorted.length > 0 && <Link href="/bridge" className="text-sm text-link hover:underline">Missing a transfer? Find it using a transaction hash ↗</Link>}
      </CardContent>
    </Card>
  );
}
