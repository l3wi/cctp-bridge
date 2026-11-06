import { beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const forwardingArgs = vi.hoisted(() => vi.fn());
vi.mock("@coral-xyz/anchor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@coral-xyz/anchor")>();

  return {
    ...actual,
    Program: {
      at: vi.fn(async () => ({
        methods: {
          depositForBurnWithHook: (params: unknown) => {
            forwardingArgs(params);
            return { accounts: () => ({ signers: () => ({ instruction: async () => new TransactionInstruction({ keys: [], programId: SystemProgram.programId, data: Buffer.from([10]) }) }) }) };
          },
          depositForBurn: () => ({
            accounts: () => ({
              signers: () => ({
                instruction: async () =>
                  new TransactionInstruction({
                    keys: [],
                    programId: SystemProgram.programId,
                    data: Buffer.from([9]),
                  }),
              }),
            }),
          }),
        },
      })),
    },
  };
});

import { buildDepositForBurnTransaction } from "@/lib/cctp/solana/burn";
import { getSolanaUsdcMint } from "@/lib/cctp/shared";

const USER = new PublicKey("11111111111111111111111111111111");
function getConfiguredOrRandomFeeRecipient(): PublicKey {
  const configured = process.env.NEXT_PUBLIC_FEE_ADDRESS_SOL;
  if (configured) {
    try {
      return new PublicKey(configured);
    } catch {
      // Fall through to a generated key for deterministic unit coverage.
    }
  }

  return Keypair.generate().publicKey;
}

const FEE_RECIPIENT = getConfiguredOrRandomFeeRecipient();

function createConnection(existingAccounts: Set<string>) {
  return {
    getFeeForMessage: vi.fn(async () => ({ value: 10000 })),
    getBalance: vi.fn(async () => 100_000_000),
    getMinimumBalanceForRentExemption: vi.fn(async () => 3_900_000),
    getLatestBlockhash: vi.fn(async () => ({
      blockhash: "11111111111111111111111111111111",
      lastValidBlockHeight: 123,
    })),
    getAccountInfo: vi.fn(async (pubkey: PublicKey) =>
      existingAccounts.has(pubkey.toBase58()) ? { data: Buffer.alloc(0) } : null
    ),
  };
}

describe("Solana burn fee support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds an atomic SPL transfer to the configured fee recipient ATA", async () => {
    const usdcMint = getSolanaUsdcMint("Solana_Devnet");
    const feeRecipientAta = await getAssociatedTokenAddress(usdcMint, FEE_RECIPIENT);
    const connection = createConnection(new Set([feeRecipientAta.toBase58()]));

    const { transaction } = await buildDepositForBurnTransaction({
      connection: connection as never,
      user: USER,
      amount: 99_985_000_000n,
      destinationChainId: 84532,
      mintRecipient: "0x1111111111111111111111111111111111111111",
      maxFee: 100n,
      minFinalityThreshold: 1000,
      sourceChainId: "Solana_Devnet",
      appFeeAmount: 15_000_000n,
      appFeeRecipient: FEE_RECIPIENT.toBase58(),
    });

    const transferIx = transaction.instructions.find((ix) =>
      ix.programId.equals(TOKEN_PROGRAM_ID)
    );

    expect(transferIx).toBeDefined();
    expect(transferIx?.keys[1]?.pubkey.toBase58()).toBe(feeRecipientAta.toBase58());
    expect(transferIx?.data[0]).toBe(3);
    expect(transferIx?.data.readBigUInt64LE(1)).toBe(15_000_000n);
    expect(connection.getAccountInfo).toHaveBeenCalledWith(feeRecipientAta);
  });

  it("uses Circle's hook instruction while preserving the atomic app fee transfer", async () => {
    const mint = getSolanaUsdcMint("Solana_Devnet");
    const feeAta = await getAssociatedTokenAddress(mint, FEE_RECIPIENT);
    const connection = createConnection(new Set([feeAta.toBase58()]));
    const hookData = "0x636374702d666f72776172640000000000000000000000000000000000000000";
    const { transaction } = await buildDepositForBurnTransaction({
      connection: connection as never, user: USER, amount: 999_600n, destinationChainId: 5042002,
      mintRecipient: "0x1111111111111111111111111111111111111111", maxFee: 60_000n,
      minFinalityThreshold: 2000, sourceChainId: "Solana_Devnet", appFeeAmount: 400n,
      appFeeRecipient: FEE_RECIPIENT.toBase58(), hookData,
    });
    expect(forwardingArgs).toHaveBeenCalledWith(expect.objectContaining({ hookData: Buffer.from(hookData.slice(2), "hex"), minFinalityThreshold: 2000 }));
    expect(transaction.instructions.some(ix => ix.programId.equals(TOKEN_PROGRAM_ID))).toBe(true);
    expect(connection.getMinimumBalanceForRentExemption).toHaveBeenCalledWith(460);
  });

  it("blocks when SOL cannot cover the exact message rent plus transaction fee", async () => {
    const connection = createConnection(new Set());
    connection.getBalance.mockResolvedValue(3_909_999);
    await expect(buildDepositForBurnTransaction({ connection: connection as never, user: USER,
      amount: 1_000_000n, destinationChainId: 84532, mintRecipient: "0x1111111111111111111111111111111111111111",
      maxFee: 0n, minFinalityThreshold: 2000, sourceChainId: "Solana_Devnet",
    })).rejects.toThrow("Insufficient SOL");
    expect(connection.getMinimumBalanceForRentExemption).toHaveBeenCalledWith(428);
  });

  it("omits the SPL fee transfer when the app fee is zero", async () => {
    const connection = createConnection(new Set());

    const { transaction } = await buildDepositForBurnTransaction({
      connection: connection as never,
      user: USER,
      amount: 1_000_000n,
      destinationChainId: 84532,
      mintRecipient: "0x1111111111111111111111111111111111111111",
      maxFee: 0n,
      minFinalityThreshold: 2000,
      sourceChainId: "Solana_Devnet",
      appFeeAmount: 0n,
    });

    expect(transaction.instructions.some((ix) => ix.programId.equals(TOKEN_PROGRAM_ID))).toBe(false);
  });

  it("fails clearly when the configured fee recipient ATA is missing", async () => {
    const connection = createConnection(new Set());

    await expect(
      buildDepositForBurnTransaction({
        connection: connection as never,
        user: USER,
        amount: 1_000_000n,
        destinationChainId: 84532,
        mintRecipient: "0x1111111111111111111111111111111111111111",
        maxFee: 100n,
        minFinalityThreshold: 1000,
        sourceChainId: "Solana_Devnet",
        appFeeAmount: 400n,
        appFeeRecipient: FEE_RECIPIENT.toBase58(),
      })
    ).rejects.toThrow("Solana fee recipient USDC account does not exist");
  });

  it("rejects a negative app fee before building an SPL transfer", async () => {
    const connection = createConnection(new Set());

    await expect(
      buildDepositForBurnTransaction({
        connection: connection as never,
        user: USER,
        amount: 1_000_000n,
        destinationChainId: 84532,
        mintRecipient: "0x1111111111111111111111111111111111111111",
        maxFee: 0n,
        minFinalityThreshold: 2000,
        sourceChainId: "Solana_Devnet",
        appFeeAmount: -1n,
      })
    ).rejects.toThrow("App fee amount cannot be negative");
  });
});
