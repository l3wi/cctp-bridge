import Link from "next/link";
import { BridgeShellActions } from "@/components/bridge-shell-actions";

export function SiteHeader({ active }: { active?: "bridge" | "history" | "find" }) {
  return (
        <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-4 py-5 sm:px-8 lg:px-10">
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-5 sm:gap-9">
            <Link href="/" className="text-[22px] font-semibold tracking-[-0.05em]">cctp.io</Link>
            <Link href="/" aria-current={active === "bridge" ? "page" : undefined} className="text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground">Bridge</Link>
            <Link href="/history" aria-current={active === "history" ? "page" : undefined} className="text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground">History</Link>
            <Link href="/bridge" aria-current={active === "find" ? "page" : undefined} className="text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground">Find transfer</Link>
          </nav>
          <BridgeShellActions inline />
        </header>
  );
}
