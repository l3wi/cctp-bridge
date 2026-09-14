import { SiteHeader } from "@/components/site-header";
import type { ReactNode } from "react";
import { DocsNavigation } from "@/components/docs/docs-navigation";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return <div className="cctp-theme flex min-h-screen flex-col bg-background text-foreground">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded focus:bg-card focus:p-4">Skip to content</a>
    <SiteHeader />
    <DocsNavigation mobile />
    <div className="mx-auto flex w-full max-w-[1600px] flex-1"><DocsNavigation />{children}</div>
  </div>;
}
