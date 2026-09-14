"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { docsNavigation } from "./content";

export function DocsNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = <nav aria-label="Documentation" className="space-y-6">
    {docsNavigation.map((group) => <div key={group.title}>
      <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-foreground">{group.title}</p>
      {group.links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={() => setOpen(false)} className={`block rounded-md px-3 py-2.5 text-sm leading-5 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring ${pathname === link.href ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground"}`}>{link.label}</Link>)}
    </div>)}
  </nav>;
  if (mobile) return <div className="border-b border-border px-5 py-3 lg:hidden">
    <button type="button" aria-expanded={open} aria-controls="mobile-docs-navigation" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-sm font-medium">Documentation <ChevronDown aria-hidden className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} /></button>
    {open && <div id="mobile-docs-navigation" className="pt-6 pb-3">{links}</div>}
  </div>;
  return <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar px-5 pt-12 pb-6 lg:flex">
    {links}
    <p className="mt-auto px-3 pt-12 text-xs leading-5 text-muted-foreground">Built on Circle CCTP<br />Independent interface by lewi</p>
  </aside>;
}
