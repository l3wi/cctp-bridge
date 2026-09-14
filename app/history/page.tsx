import type { Metadata } from "next";
import { BridgePageShell } from "@/components/bridge-page-shell";
import { TransferHistory } from "@/components/transfer-history";
import { TrackingHelp } from "@/components/tracking-help";

export const metadata: Metadata = {
  title: "Transfer history | CCTP Bridge",
  robots: { index: false, follow: true },
};

export default function HistoryPage() {
  return (
    <main className="cctp-theme min-h-screen bg-background text-foreground">
      <BridgePageShell history>
        <TransferHistory />
      </BridgePageShell>
      <TrackingHelp />
    </main>
  );
}
