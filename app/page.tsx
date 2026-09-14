import { Suspense } from "react";
import { BridgeCardSkeleton } from "@/components/bridge-card-skeleton";
import { BridgePageShell } from "@/components/bridge-page-shell";
import HomeClientPage from "./home-client";
import { HomepageContent } from "@/components/homepage-content";

export default function HomePage() {
  return (
    <main className="cctp-theme min-h-screen bg-background text-foreground">
      <BridgePageShell homepage>
        <Suspense fallback={<BridgeCardSkeleton />}>
          <HomeClientPage />
        </Suspense>
      </BridgePageShell>
      <HomepageContent />
    </main>
  );
}
