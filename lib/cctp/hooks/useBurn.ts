/**
 * Unified burn hook for CCTP transfers.
 * Handles both EVM and Solana source chains with consistent interface.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useStandardFeeConfirmation } from "@/components/bridge-card/StandardFeeConfirmation";
import { useAccount, useWalletClient } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { useToast } from "@/components/ui/use-toast";
import { getExplorerTxUrlUniversal, BRIDGEKIT_ENV } from "@/lib/bridgeConfig";
import { createEvmPublicClient, createSolanaConnection } from "@/lib/rpc/clients";
import type { BurnParams, BurnResult, ChainId, SolanaChainId, EvmTxHash } from "../types";
import { isSolanaChain } from "../types";
import { handleBurnError } from "../errors";
import { getCctpDomain, getCctpDomainSafe, FINALITY_THRESHOLDS, isUserRejection } from "../shared";

/** Callbacks for burn progress updates - exported for useCrossEcosystemBridge */
export interface BurnProgressCallbacks {
  /** Called when EVM approval tx is sent - triggers progress screen with tx hash */
  onApprovalSent?: (txHash: EvmTxHash) => void;
  /** Called when EVM approval is confirmed */
  onApprovalComplete?: (txHash: EvmTxHash) => void;
}

// EVM burn utilities
import {
  checkAllowance,
  buildApprovalData,
  buildDepositForBurnData,
  buildBridgeWithPreapprovalData,
  calculateMaxFee,
  prepareEvmBurn,
} from "../evm/burn";
import { getFastTransferFeeQuote } from "../fastTransferFee";
import { standardFeeMessage, type StandardFeeReservation, type StandardFeeRequest } from "../cumulativeFee";
import { previewStandardFeeClient, reserveStandardFeeClient, updateStandardFeeClient, recoverStandardFee, saveStandardFee, clearStandardFee } from "../standardFeeClient";

// Solana burn utilities
import {
  buildDepositForBurnTransaction,
  sendTransactionNoConfirm,
} from "../solana/burn";

function assertWalletOnSourceChain(
  walletChainId: number | undefined,
  sourceChainId: number
) {
  if (walletChainId !== sourceChainId) {
    throw new Error(
      `Wrong source chain: wallet is connected to chain ${walletChainId ?? "unknown"}, expected ${sourceChainId}.`
    );
  }
}

/**
 * Unified hook for burning USDC on any supported source chain.
 * Automatically routes to EVM or Solana implementation based on source chain.
 */
export function useBurn() {
  const confirmStandardFee = useStandardFeeConfirmation();
  // EVM wallet state
  const { address: evmAddress } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Solana wallet state
  const solanaWallet = useWallet();
  const currentWallets = useRef({ evmAddress, solanaAddress: solanaWallet.publicKey?.toBase58(), mounted: true });
  currentWallets.current.evmAddress = evmAddress;
  currentWallets.current.solanaAddress = solanaWallet.publicKey?.toBase58();
  useEffect(() => {
    currentWallets.current.mounted = true;
    return () => { currentWallets.current.mounted = false; };
  }, []);

  const { toast } = useToast();
  const [isBurning, setIsBurning] = useState(false);

  /**
   * Execute a burn on EVM chain.
   */
  const executeEvmBurn = useCallback(
    async (params: BurnParams, callbacks?: BurnProgressCallbacks, beforeBroadcast?: () => Promise<void>, onRejected?: () => Promise<void>): Promise<BurnResult> => {
      const sourceChainId = params.sourceChainId as number;

      // Validate wallet connection
      if (!evmAddress) {
        return { success: false, error: "Wallet not connected. Please connect your wallet." };
      }
      if (!walletClient) {
        return { success: false, error: "Wallet client not available." };
      }
      const publicClient = createEvmPublicClient(sourceChainId, { walletClient });

      let approvalTxHash: `0x${string}` | undefined;

      try {
        // Prepare burn configuration
        const burnConfig = await prepareEvmBurn({
          sourceChainId,
          destinationChainId: params.destinationChainId,
          amount: params.amount,
          recipientAddress: params.recipientAddress,
          transferSpeed: params.transferSpeed,
          appFeeAmount: params.appFeeAmount,
          appFeeBps: params.appFeeBps,
          appFeeRecipient: params.appFeeRecipient as `0x${string}` | undefined,
        });

        // Step 1: Approval
        toast({
          title: "Approval required",
          description: "Please approve USDC spending in your wallet...",
        });

        const approvalData = buildApprovalData(
          burnConfig.usdcAddress,
          burnConfig.approvalSpender,
          burnConfig.approvalAmount
        );

        try {
          assertWalletOnSourceChain(walletClient.chain?.id, sourceChainId);
          approvalTxHash = await walletClient.sendTransaction({
            to: approvalData.to,
            data: approvalData.data,
            chain: walletClient.chain,
            account: evmAddress,
          });

          // Trigger progress screen after approval tx is sent
          callbacks?.onApprovalSent?.(approvalTxHash);

          toast({
            title: "Approval submitted",
            description: "Waiting for approval confirmation...",
          });

          // Wait for approval confirmation (2 blocks for L2 safety)
          await publicClient.waitForTransactionReceipt({
            hash: approvalTxHash,
            confirmations: 2,
          });

          // Verify allowance was set with retry logic
          // ETH approvals can be slow on congested networks, so we retry for up to 1 minute
          const MAX_ALLOWANCE_WAIT_MS = 60_000;
          const INITIAL_BACKOFF_MS = 1_000;
          const MAX_BACKOFF_MS = 10_000;

          let allowance = 0n;
          const startTime = Date.now();
          let backoffMs = INITIAL_BACKOFF_MS;

          while (Date.now() - startTime < MAX_ALLOWANCE_WAIT_MS) {
            allowance = await checkAllowance(
              publicClient,
	              burnConfig.usdcAddress,
	              evmAddress,
	              burnConfig.approvalSpender
	            );

	            if (allowance >= burnConfig.approvalAmount) break;

            // Exponential backoff with cap: 1s -> 2s -> 4s -> 8s -> 10s (cap)
            await new Promise((r) => setTimeout(r, backoffMs));
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
          }

	          if (allowance < burnConfig.approvalAmount) {
            // Final check: verify approval tx actually succeeded before failing
            // This handles RPC lag where allowance isn't visible yet
            try {
              const receipt = await publicClient.getTransactionReceipt({
                hash: approvalTxHash,
              });

              if (receipt.status === "success") {
                // Approval tx succeeded but allowance not visible - likely RPC lag
                // Give one more extended retry window (30s) before failing
                const EXTENDED_WAIT_MS = 30_000;
                const extendedStart = Date.now();

                while (Date.now() - extendedStart < EXTENDED_WAIT_MS) {
                  allowance = await checkAllowance(
                    publicClient,
	                    burnConfig.usdcAddress,
	                    evmAddress,
	                    burnConfig.approvalSpender
	                  );
	                  if (allowance >= burnConfig.approvalAmount) break;
                  await new Promise((r) => setTimeout(r, 2_000));
                }
              }
            } catch {
              // Receipt check failed - proceed with original error
            }

            // If still insufficient after extended retry, fail
	            if (allowance < burnConfig.approvalAmount) {
              return {
                success: false,
                approvalTxHash,
                error:
                  "Approval transaction succeeded but allowance not detected. This may be due to RPC lag. Please try again or check your wallet.",
              };
            }
          }

          toast({
            title: "Approval confirmed",
            description: "Now submitting burn transaction...",
          });

          // Notify approval complete with tx hash
          callbacks?.onApprovalComplete?.(approvalTxHash);
        } catch (approvalError) {
          return handleBurnError(approvalError, "approval");
        }

        // Step 2: Burn
        toast({
          title: "Sign transaction",
          description: "Please approve the burn transaction in your wallet...",
        });

	        const burnData =
	          burnConfig.appFeeAmount > 0n &&
	          burnConfig.bridgeContractAddress &&
	          burnConfig.appFeeRecipient
	            ? buildBridgeWithPreapprovalData(burnConfig.bridgeContractAddress, {
	                amount: burnConfig.bridgeAmount,
	                destinationDomain: burnConfig.destinationDomain,
	                mintRecipient: burnConfig.mintRecipient,
	                burnToken: burnConfig.usdcAddress,
	                minFinalityThreshold: burnConfig.minFinalityThreshold,
	                maxFee: burnConfig.maxFee,
	                fee: burnConfig.appFeeAmount,
	                feeRecipient: burnConfig.appFeeRecipient,
		              })
	            : buildDepositForBurnData(burnConfig.tokenMessenger, {
	                amount: burnConfig.bridgeAmount,
	                destinationDomain: burnConfig.destinationDomain,
	                mintRecipient: burnConfig.mintRecipient,
	                burnToken: burnConfig.usdcAddress,
	                minFinalityThreshold: burnConfig.minFinalityThreshold,
	                maxFee: burnConfig.maxFee,
	              });

        assertWalletOnSourceChain(walletClient.chain?.id, sourceChainId);
        await beforeBroadcast?.();
        const burnTxHash = await walletClient.sendTransaction({
          to: burnData.to,
          data: burnData.data,
          chain: walletClient.chain,
          account: evmAddress,
        });

        // Success
        const explorerUrl = getExplorerTxUrlUniversal(sourceChainId, burnTxHash, BRIDGEKIT_ENV);
        toast({
          title: "Transaction sent",
          description: explorerUrl
            ? "Your burn transaction has been submitted."
            : `Burn tx: ${burnTxHash.slice(0, 20)}...`,
        });

	        return {
	          success: true,
	          approvalTxHash,
	          burnTxHash,
	          circleFastFee: burnConfig.maxFee,
	          appFastFee: burnConfig.appFeeAmount,
	          appFeeBps: burnConfig.appFeeBps,
	          appFeeRecipient: burnConfig.appFeeRecipient,
	        };
      } catch (error) {
        if (isUserRejection(error)) await onRejected?.();
        return handleBurnError(error, "burn");
      }
    },
    [evmAddress, walletClient, toast]
  );

  /**
   * Execute a burn on Solana chain.
   */
  const executeSolanaBurn = useCallback(
    async (params: BurnParams, beforeBroadcast?: () => Promise<void>): Promise<BurnResult> => {
      const sourceChainId = params.sourceChainId as SolanaChainId;

      // Validate wallet connection
      if (!solanaWallet.connected || !solanaWallet.publicKey) {
        return { success: false, error: "Solana wallet not connected. Please connect your wallet." };
      }
      if (!solanaWallet.signTransaction) {
        return { success: false, error: "Wallet does not support transaction signing." };
      }

      // Validate destination has CCTP domain
      const destinationDomain = getCctpDomainSafe(params.destinationChainId);
      if (destinationDomain === null) {
        return { success: false, error: `Destination chain ${params.destinationChainId} is not supported by CCTP.` };
      }

      try {
        const connection = createSolanaConnection(sourceChainId);

        // Calculate fee parameters
        const minFinalityThreshold =
          params.transferSpeed === "fast"
            ? FINALITY_THRESHOLDS.solana.fast
            : FINALITY_THRESHOLDS.solana.standard;

        const isTestnet = BRIDGEKIT_ENV === "testnet";
	        let maxFee = 0n;
	        const fastTransferFeeQuote = getFastTransferFeeQuote({
	          amount: params.amount,
	          transferSpeed: params.transferSpeed,
	          sourceChainId,
	        });
	        const appFeeAmount = params.appFeeAmount ?? fastTransferFeeQuote.feeAmount;
	        const appFeeRecipient = params.appFeeRecipient ?? fastTransferFeeQuote.recipient;
	        const appFeeBps = params.appFeeBps ?? fastTransferFeeQuote.feeBps;
	        if (appFeeAmount > 0n && !appFeeRecipient) {
	          return { success: false, error: "App fee recipient is required when an app fee is charged." };
	        }
	        const bridgeAmount = params.amount - appFeeAmount;
	        if (bridgeAmount <= 0n) {
	          return {
	            success: false,
	            error: "Transfer amount too small for fast tx fee. Choose standard transfer or increase the amount.",
	          };
	        }

	        if (params.transferSpeed === "fast") {
          try {
            const sourceDomain = getCctpDomain(sourceChainId);
            maxFee = await calculateMaxFee(
              sourceDomain,
              destinationDomain,
	              bridgeAmount,
	              "fast",
	              isTestnet
	            );

            // Safety check: fee must be less than amount
	            if (maxFee >= bridgeAmount) {
              return {
                success: false,
                error: "Transfer amount too small for fast transfer fee. Choose standard transfer or increase the amount.",
              };
            }
          } catch (feeError) {
            console.warn("Failed to calculate Solana fast fee:", feeError);
            return {
              success: false,
              error: "Unable to fetch the current fast transfer fee. Choose standard transfer or try again.",
            };
          }
        }

        toast({
          title: "Building transaction",
          description: "Preparing CCTP burn transaction...",
        });

        // Build transaction
	        const { transaction, messageAccount } = await buildDepositForBurnTransaction({
	          connection,
	          user: solanaWallet.publicKey,
	          amount: bridgeAmount,
	          destinationChainId: params.destinationChainId,
	          mintRecipient: params.recipientAddress,
	          maxFee,
	          minFinalityThreshold,
	          sourceChainId,
	          appFeeAmount,
	          appFeeRecipient,
	        });

        toast({
          title: "Sign transaction",
          description: "Please approve the transaction in your wallet...",
        });

        // Sign with wallet
        const signedTx = await solanaWallet.signTransaction(transaction);

        // Partial sign with message account (required for CCTP)
        signedTx.partialSign(messageAccount);

        // Send WITHOUT waiting for confirmation
        await beforeBroadcast?.();
        const signature = await sendTransactionNoConfirm(connection, signedTx);

        // Success
        const explorerUrl = getExplorerTxUrlUniversal(sourceChainId, signature, BRIDGEKIT_ENV);
        toast({
          title: "Transaction sent",
          description: explorerUrl
            ? "Your burn transaction has been submitted."
            : `Burn tx: ${signature.slice(0, 20)}...`,
        });

	        return {
	          success: true,
	          burnTxHash: signature,
	          circleFastFee: maxFee,
	          appFastFee: appFeeAmount,
	          appFeeBps: appFeeAmount > 0n ? appFeeBps : undefined,
	          appFeeRecipient,
	        };
      } catch (error) {
        return handleBurnError(error, "burn");
      }
    },
    [solanaWallet.connected, solanaWallet.publicKey, solanaWallet.signTransaction, toast]
  );

  /**
   * Execute burn - routes to EVM or Solana based on source chain.
   */
  const executeBurn = useCallback(
    async (params: BurnParams, callbacks?: BurnProgressCallbacks): Promise<BurnResult> => {
      setIsBurning(true);
      let reservation: StandardFeeReservation | undefined;
      let broadcasting = false;
      const address = isSolanaChain(params.sourceChainId) ? solanaWallet.publicKey?.toBase58() : evmAddress;
      try {
        if (params.transferSpeed === "standard") {
          if (!address) throw new Error("Connect your wallet to check the Standard fee");
          await recoverStandardFee(address);
          const preview = await previewStandardFeeClient({ address, sourceChainId: params.sourceChainId, amountAtomic: params.amount.toString() });
          if (preview.chargeFee && !await confirmStandardFee({ ...preview, amountAtomic: params.amount.toString() })) {
            throw Object.assign(new Error("User rejected fee confirmation"), { code: 4001 });
          }
          const currentAddress = isSolanaChain(params.sourceChainId) ? currentWallets.current.solanaAddress : currentWallets.current.evmAddress;
          if (!currentWallets.current.mounted || currentAddress !== address) throw new Error("Wallet changed. Please restart the bridge.");
          const request: StandardFeeRequest = {
            requestId: crypto.randomUUID(), address, sourceChainId: params.sourceChainId,
            amountAtomic: params.amount.toString(), issuedAt: Date.now(),
          };
          const message = standardFeeMessage(request);
          toast({ title: "Prepare Standard bridge", description: "Sign the message to verify your wallet and prepare this bridge." });
          let signature: string;
          if (isSolanaChain(params.sourceChainId)) {
            if (!solanaWallet.signMessage) throw new Error("This wallet must support message signing for Standard bridges");
            signature = btoa(String.fromCharCode(...await solanaWallet.signMessage(new TextEncoder().encode(message))));
          } else {
            if (!walletClient) throw new Error("Wallet client not available");
            signature = await walletClient.signMessage({ account: address as `0x${string}`, message });
          }
          reservation = await reserveStandardFeeClient(request, signature);
          saveStandardFee(address, reservation);
          const fee = reservation.chargeFee ? BigInt(reservation.feeAtomic) : 0n;
          if (fee !== BigInt(preview.feeAtomic)) throw new Error("Your Standard fee changed. Please retry to review the updated amount.");
          params = { ...params, appFeeAmount: fee, appFeeBps: Number(fee * 10_000_000n / params.amount) / 1_000, appFeeRecipient: reservation.recipient };
        }
        const beforeBroadcast = reservation ? async () => {
          // Treat an uncertain API response as broadcasting too: never release it blindly.
          broadcasting = true;
          await updateStandardFeeClient(reservation!, "broadcast");
        } : undefined;
        const result = isSolanaChain(params.sourceChainId)
          ? await executeSolanaBurn(params, beforeBroadcast)
          : await executeEvmBurn(params, callbacks, beforeBroadcast, async () => {
            if (reservation && address) {
              await updateStandardFeeClient(reservation, "rejected");
              clearStandardFee(address);
            }
          });
        if (reservation && address && result.burnTxHash) {
          try { saveStandardFee(address, reservation, result.burnTxHash); } catch { console.warn("Could not persist fee recovery locally"); }
          // Persist recovery information locally; reporting must not turn a sent burn into a failure.
          void updateStandardFeeClient(reservation, "submit", result.burnTxHash).catch(() => {
            console.warn("Standard fee submission will retry before the next bridge");
          });
        }
        return result;
      } catch (error) {
        return handleBurnError(error, "burn");
      } finally {
        if (reservation && address && !broadcasting) {
          try { await updateStandardFeeClient(reservation, "cancel"); clearStandardFee(address); } catch { /* Keep the reservation for recovery. */ }
        }
        setIsBurning(false);
      }
    },
    [executeEvmBurn, executeSolanaBurn, evmAddress, walletClient, solanaWallet, toast, confirmStandardFee]
  );

  return {
    executeBurn,
    isBurning,
  };
}
