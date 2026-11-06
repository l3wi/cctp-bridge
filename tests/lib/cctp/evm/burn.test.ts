import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData } from "viem";
import {
  BRIDGE_WITH_PREAPPROVAL_ABI,
  BRIDGE_WITH_HOOK_ABI,
  TOKEN_MESSENGER_WITH_HOOK_ABI,
  FORWARDING_HOOK_DATA,
  buildDepositForBurnData,
  buildBridgeWithPreapprovalData,
  prepareEvmBurn,
} from "@/lib/cctp/evm/burn";

const VALID_EVM_RECIPIENT = "0x1111111111111111111111111111111111111111";
const VALID_SOLANA_RECIPIENT = "11111111111111111111111111111111";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("EVM burn fee support", () => {
  it("encodes bridgeWithPreapproval with app fee separate from Circle maxFee", () => {
    const data = buildBridgeWithPreapprovalData(
      "0xB3FA262d0fB521cc93bE83d87b322b8A23DAf3F0",
      {
        amount: 1_000_000n,
        maxFee: 100n,
        fee: 400n,
        destinationDomain: 6,
        mintRecipient: `0x${"0".repeat(24)}2222222222222222222222222222222222222222`,
        burnToken: "0x3333333333333333333333333333333333333333",
        feeRecipient: VALID_EVM_RECIPIENT,
        minFinalityThreshold: 1000,
      }
    );

    const decoded = decodeFunctionData({
      abi: BRIDGE_WITH_PREAPPROVAL_ABI,
      data: data.data,
    });

    expect(decoded.functionName).toBe("bridgeWithPreapproval");
    expect(decoded.args[0]).toEqual(
      expect.objectContaining({
        amount: 1_000_000n,
        maxFee: 100n,
        fee: 400n,
        feeRecipient: VALID_EVM_RECIPIENT,
        destinationDomain: 6,
        minFinalityThreshold: 1000,
      })
    );
  });

  it("prepares BridgeKit bridge approval for the input amount and burns input minus app fee", async () => {
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

    const prepared = await prepareEvmBurn({
      sourceChainId: 1,
      destinationChainId: 10,
      amount: 1_000_000n,
      recipientAddress: VALID_EVM_RECIPIENT,
      transferSpeed: "fast",
      env: "mainnet",
    });

    expect(prepared.bridgeContractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(prepared.approvalSpender).toBe(prepared.bridgeContractAddress);
    expect(prepared.appFeeAmount).toBe(400n);
    expect(prepared.bridgeAmount).toBe(999_600n);
    expect(prepared.approvalAmount).toBe(1_000_000n);
    expect(prepared.maxFee).toBeGreaterThan(0n);
  });

  it("keeps the direct TokenMessenger approval path when disabled", async () => {
    const prepared = await prepareEvmBurn({
      sourceChainId: 1,
      destinationChainId: 10,
      amount: 1_000_000n,
      recipientAddress: VALID_EVM_RECIPIENT,
      transferSpeed: "standard",
      env: "mainnet",
    });

    expect(prepared.bridgeContractAddress).toBeUndefined();
    expect(prepared.approvalSpender).toBe(prepared.tokenMessenger);
    expect(prepared.appFeeAmount).toBe(0n);
    expect(prepared.bridgeAmount).toBe(1_000_000n);
    expect(prepared.approvalAmount).toBe(1_000_000n);
    expect(prepared.maxFee).toBe(0n);
  });

  it("uses the atomic app-fee path for an accepted standard support contribution", async () => {
    const prepared = await prepareEvmBurn({
      sourceChainId: 1,
      destinationChainId: 10,
      amount: 100_000_000_000n,
      recipientAddress: VALID_EVM_RECIPIENT,
      transferSpeed: "standard",
      appFeeAmount: 15_000_000n,
      appFeeBps: 1.5,
      appFeeRecipient: VALID_EVM_RECIPIENT,
      env: "mainnet",
    });

    expect(prepared.bridgeContractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(prepared.approvalSpender).toBe(prepared.bridgeContractAddress);
    expect(prepared.approvalAmount).toBe(100_000_000_000n);
    expect(prepared.bridgeAmount).toBe(99_985_000_000n);
    expect(prepared.appFeeAmount).toBe(15_000_000n);
    expect(prepared.appFeeRecipient).toBe(VALID_EVM_RECIPIENT);
    expect(prepared.maxFee).toBe(0n);
  });

  it("rejects a negative app fee before building uint256 call data", async () => {
    await expect(
      prepareEvmBurn({
        sourceChainId: 1,
        destinationChainId: 10,
        amount: 1_000_000n,
        recipientAddress: VALID_EVM_RECIPIENT,
        transferSpeed: "standard",
        appFeeAmount: -1n,
        appFeeRecipient: VALID_EVM_RECIPIENT,
        env: "mainnet",
      })
    ).rejects.toThrow("App fee amount cannot be negative");
  });
});


describe("Arc automatic claim burns", () => {
  it("encodes forwarding alongside the app fee without changing either amount", () => {
    const tx = buildBridgeWithPreapprovalData(VALID_EVM_RECIPIENT, {
      amount: 999_600n, fee: 400n, maxFee: 60_000n,
      destinationDomain: 26, mintRecipient: `0x${"0".repeat(64)}`,
      burnToken: VALID_EVM_RECIPIENT, feeRecipient: VALID_EVM_RECIPIENT,
      minFinalityThreshold: 2000, hookData: FORWARDING_HOOK_DATA,
    });
    const decoded = decodeFunctionData({ abi: BRIDGE_WITH_HOOK_ABI, data: tx.data });
    expect(decoded.args[0]).toMatchObject({ amount: 999_600n, fee: 400n, maxFee: 60_000n, minFinalityThreshold: 2000 });
    expect(decoded.args[1]).toBe(FORWARDING_HOOK_DATA);
  });
  it("uses the direct hook method for burns without an app fee", () => {
    const tx = buildDepositForBurnData(VALID_EVM_RECIPIENT, {
      amount: 1_000_000n, maxFee: 60_000n, destinationDomain: 26,
      mintRecipient: `0x${"0".repeat(64)}`, burnToken: VALID_EVM_RECIPIENT,
      hookData: FORWARDING_HOOK_DATA,
    });
    const decoded = decodeFunctionData({ abi: TOKEN_MESSENGER_WITH_HOOK_ABI, data: tx.data });
    expect(decoded.args[7]).toBe(FORWARDING_HOOK_DATA);
    expect(decoded.args[4]).toBe(`0x${"0".repeat(64)}`);
  });
  it("includes a forwarding fee for Standard and fails closed when it exceeds authorization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [{ finalityThreshold: 2000, minimumFee: 0, forwardFee: { med: 60_000 } }] }));
    const config = { sourceChainId: 1, destinationChainId: 5042, amount: 1_000_000n, recipientAddress: VALID_EVM_RECIPIENT, transferSpeed: "standard" as const, automaticClaim: true, forwardingMaxFee: "60000", env: "mainnet" as const };
    const prepared = await prepareEvmBurn(config);
    expect(prepared.maxFee).toBe(60_000n);
    expect(prepared.hookData).toBe(FORWARDING_HOOK_DATA);
    // A shared URL can carry an oversized cap; never turn it into a priority-fee payment.
    expect((await prepareEvmBurn({ ...config, forwardingMaxFee: "900000000" })).maxFee).toBe(60_000n);
    await expect(prepareEvmBurn({ ...config, forwardingMaxFee: "59000" })).rejects.toMatchObject({ code: "FORWARDING_FEE_CHANGED" });
    expect((await prepareEvmBurn({ ...config, forwardingMaxFee: "72000" })).maxFee).toBe(60_000n);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(prepareEvmBurn(config)).rejects.toThrow("offline");
  });
});
