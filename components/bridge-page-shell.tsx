import { ArrowUpRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import type { ReactNode } from "react";
import Link from "next/link";
import AnimatedBackground from "@/components/animated-bg";
import { BridgeContentBoundary } from "@/components/bridge-content-boundary";
import { BridgeShellActions } from "@/components/bridge-shell-actions";

interface BridgePageShellProps {
  children: ReactNode;
  homepage?: boolean;
  tracking?: boolean;
  history?: boolean;
  progress?: boolean;
}

export function BridgePageShell({ children, homepage = false, tracking = false, history = false, progress = false }: BridgePageShellProps) {
  if (homepage || tracking || history) {
    return (
      <section className="flex min-h-svh flex-col" aria-label={tracking ? "Track a transfer" : "USDC bridge"}>
        <SiteHeader active={homepage ? "bridge" : history || progress ? "history" : "find"} />
        <div className="flex flex-1 flex-col items-center justify-center gap-[18px] px-4 pt-6 pb-12">
          <div className="space-y-2.5 text-center">
            <h1 className="text-4xl leading-[42px] font-semibold tracking-[-0.045em]">{history ? "Transfer history" : progress ? "Your transfer" : tracking ? "Find transfer" : "CCTP Bridge"}</h1>
            <p className="text-[15px] leading-6 text-muted-foreground">{history ? "Your recent USDC transfers, all in one place." : progress ? "Follow your USDC from source to destination." : tracking ? "Look up a CCTP transfer with its source network and transaction hash." : "Native USDC. EVM ↔ Solana. Powered by Circle CCTP."}</p>
          </div>
          <div className="w-full max-w-[580px]">
            <BridgeContentBoundary>{children}</BridgeContentBoundary>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-muted-foreground sm:gap-x-6">
            {homepage && (
              <>
                <span>Native USDC on arrival</span>
                <span aria-hidden="true" className="text-divider">/</span>
              </>
            )}
            <Link href={tracking || history ? "/" : "/bridge"} className="inline-flex items-center gap-1 transition-colors hover:text-foreground">{tracking || history ? "New transfer" : "Find transfer"}<ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" /></Link>
            <span aria-hidden="true" className="text-divider">/</span>
            <Link href={tracking || history ? "/docs/recover" : "/docs/fees"} className="inline-flex items-center gap-1 transition-colors hover:text-foreground">{tracking || history ? "Recovery guide" : "Fee Details"}<ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" /></Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <AnimatedBackground>
      <BridgeShellActions />

      <div className="w-full max-w-xl min-h-[640px] pt-16 md:pt-5 pb-12 md:pb-0">
        <div className="mb-4">
          <h1 className="relative inline-block text-4xl font-bold text-white pb-2 ">
            CCTP Bridge
            <span className="hidden md:block absolute text-xs text-blue-500 -top-[7px] -right-[70px] transform rotate-15 bg-slate-800/50 px-2 py-1 rounded-md">
              {`Now with Solana!`}
            </span>
          </h1>

          <div className="text-xs text-slate-500">
            {`A native USDC bridge powered by Circle's CCTP infrastructure.`}
          </div>
        </div>

        <BridgeContentBoundary>{children}</BridgeContentBoundary>
      </div>
    </AnimatedBackground>
  );
}
