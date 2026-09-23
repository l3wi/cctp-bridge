/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UsdcRouteBridge } from "@/components/usdc-route-bridge";
import { parseBridgeIntentResult } from "@/lib/bridgeIntent";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/bridge-card", () => ({
  BridgeCard: ({ mode, initialChains, onSubmitIntent }: {
    mode: string;
    initialChains: { sourceChainId: string; targetChainId: number };
    onSubmitIntent: (intent: object) => void;
  }) => <button onClick={() => onSubmitIntent({ ...initialChains, amount: "1", targetAddress: "0x1111111111111111111111111111111111111111", transferType: "fast" })}>{mode}</button>,
}));

describe("route bridge submission", () => {
  it("navigates to execution only after explicit submission", async () => {
    render(<UsdcRouteBridge sourceChainId="Solana" targetChainId={8453} />);
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "intentOnly" }));
    const url = new URL(push.mock.calls[0][0], "https://www.cctp.io");
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("mode")).toBe("execute");
    expect(parseBridgeIntentResult(url.searchParams)).toMatchObject({
      intent: { sourceChainId: "Solana", targetChainId: 8453, amount: "1" },
    });
  });
});
