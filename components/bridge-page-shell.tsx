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
  title?: string;
  subtitle?: string;
}

export function BridgePageShell({ children, homepage = false, tracking = false, history = false, progress = false, title, subtitle }: BridgePageShellProps) {
  if (homepage || tracking || history) {
    const footerLinks = homepage
      ? [
          { href: "/docs/transfer-speed", label: "Fast vs Standard" },
          { href: "/docs/fees", label: "Fee Details" },
          { href: "/bridge", label: "Find Transfer" },
        ]
      : [
          { href: "/", label: "New transfer" },
          { href: "/docs/recover", label: "Recovery guide" },
        ];
    return (
      <section className="flex min-h-svh flex-col" aria-label={tracking ? "Track a transfer" : "USDC bridge"}>
        <SiteHeader active={homepage ? "bridge" : history || progress ? "history" : "find"} />
        <div className="flex flex-1 flex-col items-center justify-center gap-[18px] px-4 pt-6 pb-12">
          <div className="space-y-2.5 text-center">
            <h1 className="text-4xl leading-[42px] font-semibold tracking-[-0.045em]">{title ?? (history ? "Transfer history" : progress ? "Your transfer" : tracking ? "Find transfer" : "CCTP Bridge")}</h1>
            <p className="text-[15px] leading-6 text-muted-foreground">{subtitle ?? (history ? "Your recent USDC transfers, all in one place." : progress ? "Follow your USDC from source to destination." : tracking ? "Look up a CCTP transfer with its source network and transaction hash." : "Native USDC. EVM ↔ Solana. Powered by Circle CCTP.")}</p>
          </div>
          <div className="w-full max-w-[580px]">
            <BridgeContentBoundary>{children}</BridgeContentBoundary>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-muted-foreground sm:gap-x-6">
            {footerLinks.map((link, index) => (
              <span key={link.href} className="contents">
                {index > 0 && <span aria-hidden="true" className="text-divider">/</span>}
                <Link href={link.href} className="inline-flex items-center gap-1 transition-colors hover:text-foreground">{link.label}<ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" /></Link>
              </span>
            ))}
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
