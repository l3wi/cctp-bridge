/**
 * Solana CCTP v2 burn transaction builder.
 * Bypasses Bridge Kit SDK to avoid WebSocket confirmation hangs.
 * Builds depositForBurn instruction using Anchor.
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import type { ChainId, SolanaChainId } from "../types";
import {
  getCctpDomain,
  getSolanaUsdcMint,
  formatMintRecipientPubkey,
  FINALITY_THRESHOLDS,
} from "../shared";

// =============================================================================
// Program IDs
// =============================================================================

/** CCTP V2 Token Messenger Program ID (same for mainnet and devnet) */
export const TOKEN_MESSENGER_PROGRAM_ID = new PublicKey(
  "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe"
);

/** CCTP V2 Message Transmitter Program ID */
export const MESSAGE_TRANSMITTER_PROGRAM_ID = new PublicKey(
  "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC"
);

// =============================================================================
// PDA Derivation
// =============================================================================

interface DerivedPdas {
  senderAuthorityPda: PublicKey;
  tokenMessengerPda: PublicKey;
  tokenMinterPda: PublicKey;
  localTokenPda: PublicKey;
  messageTransmitterPda: PublicKey;
  remoteTokenMessengerPda: PublicKey;
}

/**
 * Derive all required PDAs for CCTP depositForBurn instruction.
 */
export function deriveBurnPdas(
  destinationDomain: number,
  usdcMint: PublicKey
): DerivedPdas {
  const [senderAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sender_authority")],
    TOKEN_MESSENGER_PROGRAM_ID
  );

  const [tokenMessengerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_messenger")],
    TOKEN_MESSENGER_PROGRAM_ID
  );

  const [tokenMinterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_minter")],
    TOKEN_MESSENGER_PROGRAM_ID
  );

  const [localTokenPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("local_token"), usdcMint.toBuffer()],
    TOKEN_MESSENGER_PROGRAM_ID
  );

  const [messageTransmitterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("message_transmitter")],
    MESSAGE_TRANSMITTER_PROGRAM_ID
  );

  // Domain seed as UTF-8 string (matches Bridge Kit SDK)
  const domainSeed = Buffer.from(destinationDomain.toString(), "utf8");
  const [remoteTokenMessengerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("remote_token_messenger"), domainSeed],
    TOKEN_MESSENGER_PROGRAM_ID
  );

  return {
    senderAuthorityPda,
    tokenMessengerPda,
    tokenMinterPda,
    localTokenPda,
    messageTransmitterPda,
    remoteTokenMessengerPda,
  };
}

// =============================================================================
// Transaction Building
// =============================================================================

export interface SolanaBurnParams {
  connection: Connection;
  user: PublicKey;
  amount: bigint;
  destinationChainId: ChainId;
  mintRecipient: string;
  maxFee: bigint;
  minFinalityThreshold: number;
  sourceChainId: SolanaChainId;
  hookData?: `0x${string}`;
  appFeeAmount?: bigint;
  appFeeRecipient?: string;
}

export interface SolanaBurnResult {
  transaction: Transaction;
  messageAccount: Keypair;
}

/**
 * Build a CCTP depositForBurn transaction for Solana.
 * Uses Anchor to load program IDL from chain.
 */
export async function buildDepositForBurnTransaction(
  params: SolanaBurnParams
): Promise<SolanaBurnResult> {
  const {
    connection,
    user,
    amount,
    destinationChainId,
    mintRecipient,
    maxFee,
    minFinalityThreshold,
    sourceChainId,
    appFeeAmount = 0n,
    appFeeRecipient,
    hookData,
  } = params;

  if (amount <= 0n) {
    throw new Error("Burn amount must be positive");
  }
  if (maxFee < 0n) {
    throw new Error("Max fee cannot be negative");
  }
  if (maxFee >= amount) {
    throw new Error("Max fee must be less than burn amount");
  }
  if (appFeeAmount < 0n) {
    throw new Error("App fee amount cannot be negative");
  }

  const destinationDomain = getCctpDomain(destinationChainId);
  const usdcMint = getSolanaUsdcMint(sourceChainId);
  const pdas = deriveBurnPdas(destinationDomain, usdcMint);

  // Get user's USDC ATA
  const userUsdcAta = await getAssociatedTokenAddress(usdcMint, user);
  const appFeeIxs = [];

  if (appFeeAmount > 0n) {
    if (!appFeeRecipient) {
      throw new Error("Fast tx fee is enabled, but no Solana fee recipient is configured.");
    }

    const appFeeRecipientOwner = new PublicKey(appFeeRecipient);
    const appFeeRecipientAta = await getAssociatedTokenAddress(
      usdcMint,
      appFeeRecipientOwner,
      true
    );
    const appFeeRecipientAtaInfo = await connection.getAccountInfo(appFeeRecipientAta);

    if (!appFeeRecipientAtaInfo) {
      throw new Error(
        `Solana fee recipient USDC account does not exist: ${appFeeRecipientAta.toBase58()}. Create it before enabling fast tx fees.`
      );
    }

    appFeeIxs.push(
      createTransferInstruction(
        userUsdcAta,
        appFeeRecipientAta,
        user,
        appFeeAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }

  // Generate keypair for message event data account
  const messageAccount = Keypair.generate();

  // Create minimal wallet wrapper for Anchor (only used to build instructions)
  const wallet = {
    publicKey: user,
    signTransaction: async <T>(tx: T): Promise<T> => tx,
    signAllTransactions: async <T>(txs: T[]): Promise<T[]> => txs,
  };

  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  // Load Token Messenger program from chain (IDL fetched automatically)
  const tokenMessenger = await Program.at(TOKEN_MESSENGER_PROGRAM_ID, provider);

  // Format mint recipient as PublicKey (handles both EVM and Solana destinations)
  const mintRecipientKey = formatMintRecipientPubkey(
    mintRecipient,
    destinationChainId
  );

  // Circle v2 MessageSent: discriminator8 + rent_payer32 + created_at8 + Vec prefix4,
  // plus message header148 and burn body228. The hook is appended to that body.
  const MESSAGE_ACCOUNT_SIZE = 428 + (hookData ? (hookData.length - 2) / 2 : 0);
  const rentExemptLamports = await connection.getMinimumBalanceForRentExemption(MESSAGE_ACCOUNT_SIZE);

  const fundMessageAccountIx = SystemProgram.transfer({
    fromPubkey: user,
    toPubkey: messageAccount.publicKey,
    lamports: rentExemptLamports,
  });

  /**
   * Build depositForBurn instruction using Anchor.
   * Cast required: Anchor generates methods dynamically from IDL at runtime.
   * TypeScript cannot infer these methods from the Program type.
   * The method signature is validated by the IDL, not compile-time types.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const burnMethod = hookData ? "depositForBurnWithHook" : "depositForBurn";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const depositForBurnIx = await (tokenMessenger.methods as any)[burnMethod]({
      amount: new BN(amount.toString()),
      destinationDomain,
      mintRecipient: mintRecipientKey,
      destinationCaller: PublicKey.default, // No specific caller restriction
      maxFee: new BN(maxFee.toString()),
      minFinalityThreshold,
      ...(hookData ? { hookData: Buffer.from(hookData.slice(2), "hex") } : {}),
    })
    .accounts({
      owner: user,
      senderAuthorityPda: pdas.senderAuthorityPda,
      burnTokenAccount: userUsdcAta,
      burnTokenMint: usdcMint,
      tokenMessenger: pdas.tokenMessengerPda,
      tokenMinter: pdas.tokenMinterPda,
      localToken: pdas.localTokenPda,
      remoteTokenMessenger: pdas.remoteTokenMessengerPda,
      messageTransmitter: pdas.messageTransmitterPda,
      messageSentEventData: messageAccount.publicKey,
      eventRentPayer: user,
      messageTransmitterProgram: MESSAGE_TRANSMITTER_PROGRAM_ID,
      tokenMessengerMinterProgram: TOKEN_MESSENGER_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([messageAccount])
    .instruction();

  // Build transaction
  const transaction = new Transaction().add(
    fundMessageAccountIx,
    ...appFeeIxs,
    depositForBurnIx
  );

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = user;

  const fee = await connection.getFeeForMessage(transaction.compileMessage(), "confirmed");
  if (fee.value === null) throw new Error("Unable to estimate Solana transaction fee. Please retry.");
  const balance = await connection.getBalance(user, "confirmed");
  if (balance < rentExemptLamports + fee.value) {
    throw new Error("Insufficient SOL for the message account rent and transaction fee");
  }

  return { transaction, messageAccount };
}

// =============================================================================
// Transaction Sending
// =============================================================================

/**
 * Send a signed transaction WITHOUT waiting for confirmation.
 * Returns the signature immediately after sending.
 *
 * This avoids WebSocket confirmation hangs that occur with
 * connection.confirmTransaction() on some RPC providers.
 */
export async function sendTransactionNoConfirm(
  connection: Connection,
  signedTransaction: Transaction
): Promise<string> {
  const rawTransaction = signedTransaction.serialize();

  try {
    // Send without confirming - returns immediately
    const signature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false, // Still do preflight simulation to catch errors
      preflightCommitment: "confirmed",
    });

    return signature;
  } catch (error) {
    // Provide user-friendly messages for common preflight errors
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("insufficient funds") || message.includes("Insufficient")) {
      throw new Error("Insufficient SOL for transaction fees");
    }
    if (message.includes("insufficient lamports")) {
      throw new Error("Insufficient SOL balance for rent deposit");
    }
    if (message.includes("TokenAccountNotFoundError") || message.includes("could not find account")) {
      throw new Error("USDC token account not found. Please ensure you have USDC in your wallet.");
    }
    if (message.includes("InsufficientFunds") || message.includes("insufficient token")) {
      throw new Error("Insufficient USDC balance for this transfer");
    }
    if (message.includes("blockhash not found") || message.includes("BlockhashNotFound")) {
      throw new Error("Transaction expired. Please try again.");
    }

    // Re-throw with original message for unhandled errors
    throw error;
  }
}

// =============================================================================
// High-Level Burn Helpers
// =============================================================================

export interface SolanaBurnConfig {
  sourceChainId: SolanaChainId;
  destinationChainId: ChainId;
  amount: bigint;
  recipientAddress: string;
  transferSpeed: "fast" | "standard";
}

/**
 * Prepare Solana burn parameters.
 * Returns configuration needed for buildDepositForBurnTransaction.
 */
export function prepareSolanaBurn(config: SolanaBurnConfig): {
  destinationDomain: number;
  minFinalityThreshold: number;
} {
  const destinationDomain = getCctpDomain(config.destinationChainId);

  const minFinalityThreshold =
    config.transferSpeed === "fast"
      ? FINALITY_THRESHOLDS.solana.fast
      : FINALITY_THRESHOLDS.solana.standard;

  return {
    destinationDomain,
    minFinalityThreshold,
  };
}

// Re-export shared utilities for convenience
export {
  getCctpDomain,
  getSolanaUsdcMint,
  formatMintRecipientPubkey,
  FINALITY_THRESHOLDS,
} from "../shared";
