import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateBridgeFee } from "@/lib/cctp/estimate";

const VALID_EVM_RECIPIENT = "0x1111111111111111111111111111111111111111";
const VALID_SOLANA_RECIPIENT = "11111111111111111111111111111111";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("estimateBridgeFee app fees", () => {
  it("includes Circle provider fee and app fee in the deducted fee total", async () => {
    vi.stubEnv("NEXT_PUBLIC_FAST_TX_FEE_BPS", "4");
    vi.stubEnv("NEXT_PUBLIC_FEE_ADDRESS_EVM", VALID_EVM_RECIPIENT);
    vi.stubEnv("NEXT_PUBLIC_FEE_ADDRESS_SOL", VALID_SOLANA_RECIPIENT);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ finalityThreshold: 1000, minimumFee: "1" }],
      })
    );

    const estimate = await estimateBridgeFee({
      sourceChainId: 84532,
      destinationChainId: 11155111,
      amount: "1.000001",
      speed: "fast",
    });

    expect(estimate.fees).toEqual([
      { amount: "0.000100", type: "provider" },
      { amount: "0.000401", type: "kit" },
    ]);
    expect(estimate.receivedAmount).toBe("0.999500");
    expect(estimate.sourceAmount).toBe("1.000001");
  });

  it("does not include app fees for standard estimates", async () => {
    vi.stubEnv("NEXT_PUBLIC_FAST_TX_FEE_BPS", "4");
    vi.stubEnv("NEXT_PUBLIC_FEE_ADDRESS_EVM", VALID_EVM_RECIPIENT);
    vi.stubEnv("NEXT_PUBLIC_FEE_ADDRESS_SOL", VALID_SOLANA_RECIPIENT);

    const estimate = await estimateBridgeFee({
      sourceChainId: 84532,
      destinationChainId: 11155111,
      amount: "1.000001",
      speed: "standard",
    });

    expect(estimate.fees).toEqual([]);
    expect(estimate.receivedAmount).toBe("1.000001");
    expect(estimate.sourceAmount).toBe("1.000001");
  });
});

// Protect Standard forwarding from the historical zero-fee early return.
describe("automatic claim estimates", () => {
  it("quotes forwarding for Standard and subtracts it from the receive amount", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [
      { finalityThreshold: 2000, minimumFee: 0, forwardFee: { med: 60000 } },
    ] });
    vi.stubGlobal("fetch", fetchMock);
    const estimate = await estimateBridgeFee({ sourceChainId: 421614, destinationChainId: 5042002, amount: "1000", speed: "standard", automaticClaim: true });
    expect(fetchMock.mock.calls[0][0]).toContain("?forward=true");
    expect(estimate.fees).toContainEqual({ type: "forwarder", amount: "0.060000" });
    expect(estimate.receivedAmount).toBe("999.940000");
    expect(estimate.forwardingMaxFee).toBe("60000");
  });

  it("fails rather than offering a free automatic claim when quoting fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(estimateBridgeFee({ sourceChainId: 421614, destinationChainId: 5042002, amount: "1000", speed: "standard", automaticClaim: true })).rejects.toThrow();
  });
});

describe("forwarding across ecosystems", () => {
  it.each([
    { sourceChainId: 84532, destinationChainId: 11155111 },
    { sourceChainId: "Solana_Devnet" as const, destinationChainId: 5042002 },
    { sourceChainId: 84532, destinationChainId: "Solana_Devnet" as const },
  ])("quotes Standard automatic claim for $sourceChainId → $destinationChainId", async (route) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [
      { finalityThreshold: 2000, minimumFee: 0, forwardFee: { med: 60000 } },
    ] });
    vi.stubGlobal("fetch", fetchMock);
    const recipientAddress = route.destinationChainId === "Solana_Devnet" ? VALID_SOLANA_RECIPIENT : VALID_EVM_RECIPIENT;
    const estimate = await estimateBridgeFee({ ...route, amount: "1000", speed: "standard", automaticClaim: true, recipientAddress });
    expect(estimate.forwardingRecipient).toBe(recipientAddress);
    expect(estimate.receivedAmount).toBe("999.940000");
    expect(estimate.forwardingMaxFee).toBe("60000");
    if (route.destinationChainId === "Solana_Devnet") expect(fetchMock.mock.calls[0][0]).toContain("includeRecipientSetup=true");
  });
});
