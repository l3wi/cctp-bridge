/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { Keypair, Transaction } from "@solana/web3.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBurn } from "@/lib/cctp/hooks/useBurn";

const sendTransactionMock = vi.hoisted(() => vi.fn());
const waitForTransactionReceiptMock = vi.hoisted(() => vi.fn());
const getTransactionReceiptMock = vi.hoisted(() => vi.fn());
const checkAllowanceMock = vi.hoisted(() => vi.fn());
const calculateMaxFeeMock = vi.hoisted(() => vi.fn());
const createSolanaConnectionMock = vi.hoisted(() => vi.fn());
const buildDepositForBurnTransactionMock = vi.hoisted(() => vi.fn());
const sendSolanaTransactionNoConfirmMock = vi.hoisted(() => vi.fn());
const signSolanaTransactionMock = vi.hoisted(() => vi.fn());
const reserveFeeMock = vi.hoisted(() => vi.fn());
const previewFeeMock = vi.hoisted(() => vi.fn());
const confirmFeeMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/bridge-card/StandardFeeConfirmation", () => ({ useStandardFeeConfirmation: () => confirmFeeMock }));
const updateFeeMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("@/lib/cctp/standardFeeClient", () => ({
  reserveStandardFeeClient: reserveFeeMock,
  previewStandardFeeClient: previewFeeMock,
  updateStandardFeeClient: updateFeeMock,
  recoverStandardFee: vi.fn(), saveStandardFee: vi.fn(), clearStandardFee: vi.fn(),
}));
beforeEach(() => {
  previewFeeMock.mockReset().mockResolvedValue({ volumeAtomic: "0", chargeFee: false, feeAtomic: "0" });
  confirmFeeMock.mockReset().mockResolvedValue(true);
  reserveFeeMock.mockReset().mockResolvedValue({ id: "test", token: "token", chargeFee: false, feeAtomic: "0", recipient: "11111111111111111111111111111111" });
});
const walletClientState = vi.hoisted(() => ({
  current: undefined as
    | {
        account: { address: `0x${string}` };
        chain: { id: number };
        sendTransaction: typeof sendTransactionMock;
        signMessage: () => Promise<string>;
        transport: { request: unknown };
      }
    | undefined,
}));
const solanaWalletState = vi.hoisted(() => ({
  connected: false,
  publicKey: null as ReturnType<typeof Keypair.generate>["publicKey"] | null,
  signTransaction: undefined as typeof signSolanaTransactionMock | undefined,
  signMessage: vi.fn().mockResolvedValue(new Uint8Array(64)),
}));

const createMockSolanaBurnResult = () => {
  const transaction = new Transaction();
  transaction.partialSign = vi.fn();

  return {
    transaction,
    messageAccount: Keypair.generate(),
  };
};

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: "0x1111111111111111111111111111111111111111",
  }),
  useWalletClient: () => ({
    data: walletClientState.current,
  }),
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => solanaWalletState,
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/bridgeConfig", () => ({
  BRIDGEKIT_ENV: "testnet",
  getExplorerTxUrlUniversal: () => null,
  getAllSupportedChains: () => [
    { type: "solana", chain: "Solana_Devnet", name: "Solana Devnet", cctp: { domain: 5 } },
    { type: "evm", chainId: 84532, name: "Base Sepolia", cctp: { domain: 6 } },
  ],
}));

vi.mock("@/lib/rpc/clients", () => ({
  createEvmPublicClient: () => ({
    waitForTransactionReceipt: waitForTransactionReceiptMock,
    getTransactionReceipt: getTransactionReceiptMock,
  }),
  createSolanaConnection: createSolanaConnectionMock,
}));

vi.mock("@/lib/cctp/evm/burn", () => ({
  getTokenMessengerAddress: vi.fn(),
  getUsdcAddress: vi.fn(),
  checkAllowance: checkAllowanceMock,
  buildApprovalData: () => ({
    to: "0x2222222222222222222222222222222222222222",
    data: "0xapproval",
  }),
	  buildDepositForBurnData: () => ({
	    to: "0x3333333333333333333333333333333333333333",
	    data: "0xburn",
	  }),
	  buildBridgeWithPreapprovalData: () => ({
	    to: "0x5555555555555555555555555555555555555555",
	    data: "0xbridge",
	  }),
	  calculateMaxFee: calculateMaxFeeMock,
	  prepareEvmBurn: vi.fn().mockResolvedValue({
	    tokenMessenger: "0x2222222222222222222222222222222222222222",
	    usdcAddress: "0x4444444444444444444444444444444444444444",
	    approvalSpender: "0x2222222222222222222222222222222222222222",
	    approvalAmount: 1_000_000n,
	    bridgeAmount: 1_000_000n,
	    destinationDomain: 6,
	    mintRecipient: `0x${"0".repeat(24)}5555555555555555555555555555555555555555`,
	    minFinalityThreshold: 2000,
	    maxFee: 0n,
	    appFeeAmount: 0n,
	  }),
	}));

vi.mock("@/lib/cctp/solana/burn", () => ({
  buildDepositForBurnTransaction: buildDepositForBurnTransactionMock,
  sendTransactionNoConfirm: sendSolanaTransactionNoConfirmMock,
}));

describe("useBurn EVM chain assertions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletClientState.current = {
      account: { address: "0x1111111111111111111111111111111111111111" },
      chain: { id: 8453 },
      sendTransaction: sendTransactionMock,
      signMessage: vi.fn().mockResolvedValue("0xsigned"),
      transport: { request: vi.fn() },
    };
    sendTransactionMock.mockResolvedValue(`0x${"a".repeat(64)}`);
    waitForTransactionReceiptMock.mockResolvedValue({ status: "success" });
    getTransactionReceiptMock.mockResolvedValue({ status: "success" });
    checkAllowanceMock.mockResolvedValue(1_000_000n);
    calculateMaxFeeMock.mockResolvedValue(100n);
    createSolanaConnectionMock.mockReturnValue({});
    buildDepositForBurnTransactionMock.mockResolvedValue(createMockSolanaBurnResult());
    signSolanaTransactionMock.mockImplementation(async (transaction) => transaction);
    sendSolanaTransactionNoConfirmMock.mockResolvedValue("5Za4L7SolanaSignature");
    solanaWalletState.connected = false;
    solanaWalletState.publicKey = null;
    solanaWalletState.signTransaction = undefined;
  });

  it("rejects approval before sending when the wallet is not on the source chain", async () => {
    walletClientState.current!.chain.id = 1;
    const { result } = renderHook(() => useBurn());

    let burnResult: Awaited<ReturnType<typeof result.current.executeBurn>>;
    await act(async () => {
      burnResult = await result.current.executeBurn({
        sourceChainId: 8453,
        destinationChainId: 10,
        amount: 1_000_000n,
        recipientAddress: "0x5555555555555555555555555555555555555555",
        transferSpeed: "standard",
      });
    });

    expect(sendTransactionMock).not.toHaveBeenCalled();
    expect(burnResult!).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining("expected 8453"),
      })
    );
  });

  it("rejects burn before sending when the wallet changes chain after approval", async () => {
    sendTransactionMock.mockImplementation(async () => {
      walletClientState.current!.chain.id = 1;
      return `0x${"b".repeat(64)}`;
    });
    const { result } = renderHook(() => useBurn());

    let burnResult: Awaited<ReturnType<typeof result.current.executeBurn>>;
    await act(async () => {
      burnResult = await result.current.executeBurn({
        sourceChainId: 8453,
        destinationChainId: 10,
        amount: 1_000_000n,
        recipientAddress: "0x5555555555555555555555555555555555555555",
        transferSpeed: "standard",
      });
    });

    expect(sendTransactionMock).toHaveBeenCalledTimes(1);
    expect(burnResult!).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining("expected 8453"),
      })
    );
  });
});

describe("useBurn Solana finality and fast fee safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletClientState.current = undefined;
    calculateMaxFeeMock.mockResolvedValue(100n);
    createSolanaConnectionMock.mockReturnValue({});
    buildDepositForBurnTransactionMock.mockResolvedValue(createMockSolanaBurnResult());
    signSolanaTransactionMock.mockImplementation(async (transaction) => transaction);
    sendSolanaTransactionNoConfirmMock.mockResolvedValue("5Za4L7SolanaSignature");
    solanaWalletState.connected = true;
    solanaWalletState.publicKey = Keypair.generate().publicKey;
    solanaWalletState.signTransaction = signSolanaTransactionMock;
  });

  it("builds fast Solana burns with the CCTP v2 fast finality threshold", async () => {
    const { result } = renderHook(() => useBurn());

    let burnResult: Awaited<ReturnType<typeof result.current.executeBurn>>;
    await act(async () => {
      burnResult = await result.current.executeBurn({
        sourceChainId: "Solana_Devnet",
        destinationChainId: 84532,
        amount: 1_000_000n,
        recipientAddress: "0x5555555555555555555555555555555555555555",
        transferSpeed: "fast",
      });
    });

    expect(calculateMaxFeeMock).toHaveBeenCalledWith(5, 6, 1_000_000n, "fast", true);
    expect(buildDepositForBurnTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        minFinalityThreshold: 1000,
        maxFee: 100n,
      })
    );
    expect(signSolanaTransactionMock).toHaveBeenCalledTimes(1);
    expect(sendSolanaTransactionNoConfirmMock).toHaveBeenCalledTimes(1);
    expect(burnResult!).toEqual(
      expect.objectContaining({
        success: true,
        burnTxHash: "5Za4L7SolanaSignature",
      })
    );
  });

  it("builds standard Solana burns with the CCTP v2 standard threshold and no fast fee", async () => {
    const { result } = renderHook(() => useBurn());

    await act(async () => {
      await result.current.executeBurn({
        sourceChainId: "Solana_Devnet",
        destinationChainId: 84532,
        amount: 1_000_000n,
        recipientAddress: "0x5555555555555555555555555555555555555555",
        transferSpeed: "standard",
      });
    });

    expect(calculateMaxFeeMock).not.toHaveBeenCalled();
    expect(buildDepositForBurnTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        minFinalityThreshold: 2000,
        maxFee: 0n,
      })
    );
    expect(signSolanaTransactionMock).toHaveBeenCalledTimes(1);
    expect(sendSolanaTransactionNoConfirmMock).toHaveBeenCalledTimes(1);
  });

  it("blocks fast Solana burns before build/sign/send when fee lookup fails", async () => {
    calculateMaxFeeMock.mockRejectedValue(new Error("fee service unavailable"));
    const { result } = renderHook(() => useBurn());

    let burnResult: Awaited<ReturnType<typeof result.current.executeBurn>>;
    await act(async () => {
      burnResult = await result.current.executeBurn({
        sourceChainId: "Solana_Devnet",
        destinationChainId: 84532,
        amount: 1_000_000n,
        recipientAddress: "0x5555555555555555555555555555555555555555",
        transferSpeed: "fast",
      });
    });

    expect(burnResult!).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining("Unable to fetch"),
      })
    );
    expect(buildDepositForBurnTransactionMock).not.toHaveBeenCalled();
    expect(signSolanaTransactionMock).not.toHaveBeenCalled();
    expect(sendSolanaTransactionNoConfirmMock).not.toHaveBeenCalled();
  });

  it("includes the API-approved cumulative fee in a Standard Solana burn", async () => {
    previewFeeMock.mockResolvedValue({ volumeAtomic: "1000000000000", chargeFee: true, feeAtomic: "100000000" });
    reserveFeeMock.mockResolvedValue({ id: "test", token: "token", chargeFee: true, feeAtomic: "100000000", recipient: "11111111111111111111111111111111" });
    const { result } = renderHook(() => useBurn());
    await act(async () => {
      await result.current.executeBurn({ sourceChainId: "Solana_Devnet", destinationChainId: 84532, amount: 200_000_000n, recipientAddress: "0x5555555555555555555555555555555555555555", transferSpeed: "standard" });
    });
    expect(buildDepositForBurnTransactionMock).toHaveBeenCalledWith(expect.objectContaining({ amount: 100_000_000n, appFeeAmount: 100_000_000n }));
    expect(updateFeeMock).toHaveBeenCalledWith(expect.anything(), "broadcast");
    expect(updateFeeMock).toHaveBeenCalledWith(expect.anything(), "submit", "5Za4L7SolanaSignature");
    expect(confirmFeeMock).toHaveBeenCalledWith({ volumeAtomic: "1000000000000", chargeFee: true, feeAtomic: "100000000", amountAtomic: "200000000" });
  });

  it("does not sign, reserve or send when the fee confirmation is cancelled", async () => {
    previewFeeMock.mockResolvedValue({ volumeAtomic: "1000000000000", chargeFee: true, feeAtomic: "100000000" });
    confirmFeeMock.mockResolvedValue(false);
    solanaWalletState.signMessage.mockClear();
    const { result } = renderHook(() => useBurn());
    await act(async () => {
      await result.current.executeBurn({ sourceChainId: "Solana_Devnet", destinationChainId: 84532, amount: 200_000_000n, recipientAddress: "0x5555555555555555555555555555555555555555", transferSpeed: "standard" });
    });
    expect(solanaWalletState.signMessage).not.toHaveBeenCalled();
    expect(reserveFeeMock).not.toHaveBeenCalled();
    expect(buildDepositForBurnTransactionMock).not.toHaveBeenCalled();
    expect(sendSolanaTransactionNoConfirmMock).not.toHaveBeenCalled();
  });

  it("cancels a changed reservation instead of sending an unapproved fee", async () => {
    reserveFeeMock.mockResolvedValue({ id: "test", token: "token", chargeFee: true, feeAtomic: "100000000", recipient: "11111111111111111111111111111111" });
    const { result } = renderHook(() => useBurn());
    await act(async () => {
      await result.current.executeBurn({ sourceChainId: "Solana_Devnet", destinationChainId: 84532, amount: 200_000_000n, recipientAddress: "0x5555555555555555555555555555555555555555", transferSpeed: "standard" });
    });
    expect(updateFeeMock).toHaveBeenCalledWith(expect.anything(), "cancel");
    expect(buildDepositForBurnTransactionMock).not.toHaveBeenCalled();
  });

  it("does not build or send a Standard burn when the fee API is unavailable", async () => {
    reserveFeeMock.mockRejectedValue(new Error("Fee API unavailable"));
    const { result } = renderHook(() => useBurn());
    await act(async () => {
      await result.current.executeBurn({ sourceChainId: "Solana_Devnet", destinationChainId: 84532, amount: 200_000_000n, recipientAddress: "0x5555555555555555555555555555555555555555", transferSpeed: "standard" });
    });
    expect(buildDepositForBurnTransactionMock).not.toHaveBeenCalled();
    expect(sendSolanaTransactionNoConfirmMock).not.toHaveBeenCalled();
  });

  it("blocks fast Solana burns before build/sign/send when the fast fee consumes the amount", async () => {
    calculateMaxFeeMock.mockResolvedValue(1_000_000n);
    const { result } = renderHook(() => useBurn());

    let burnResult: Awaited<ReturnType<typeof result.current.executeBurn>>;
    await act(async () => {
      burnResult = await result.current.executeBurn({
        sourceChainId: "Solana_Devnet",
        destinationChainId: 84532,
        amount: 1_000_000n,
        recipientAddress: "0x5555555555555555555555555555555555555555",
        transferSpeed: "fast",
      });
    });

    expect(burnResult!).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining("too small"),
      })
    );
    expect(buildDepositForBurnTransactionMock).not.toHaveBeenCalled();
    expect(signSolanaTransactionMock).not.toHaveBeenCalled();
    expect(sendSolanaTransactionNoConfirmMock).not.toHaveBeenCalled();
  });
});
