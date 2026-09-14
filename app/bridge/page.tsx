import { TrackingHelp } from "@/components/tracking-help";
import { Suspense } from "react";
import { BridgeCardSkeleton } from "@/components/bridge-card-skeleton";
import { BridgePageShell } from "@/components/bridge-page-shell";
import BridgeAddPageClient from "./bridge-add-page-client";

export default function BridgeAddPage() {
  return (
    <main className="cctp-theme min-h-screen bg-background text-foreground">
    <BridgePageShell tracking>
      <Suspense fallback={<BridgeCardSkeleton />}>
        <BridgeAddPageClient />
      </Suspense>
    </BridgePageShell>
    <TrackingHelp />
    </main>
  );
}
