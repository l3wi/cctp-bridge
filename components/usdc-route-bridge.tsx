"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { BridgeCard, type BridgeSubmissionIntent } from "@/components/bridge-card";
import { serializeBridgeIntent } from "@/lib/bridgeIntent";
import type { ChainId } from "@/lib/types";

export function UsdcRouteBridge({ sourceChainId, targetChainId }: {
  sourceChainId: ChainId;
  targetChainId: ChainId;
}) {
  const router = useRouter();
  const handleSubmit = useCallback((intent: BridgeSubmissionIntent) => {
    const params = serializeBridgeIntent(intent);
    params.set("mode", "execute");
    router.push(`/?${params.toString()}`);
  }, [router]);

  return (
    <BridgeCard
      key={`${sourceChainId}:${targetChainId}`}
      mode="intentOnly"
      initialChains={{ sourceChainId, targetChainId }}
      onSubmitIntent={handleSubmit}
    />
  );
}
