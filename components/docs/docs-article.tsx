import Link from "next/link";
import type { ReactNode } from "react";

export type DocSection = { id: string; title: string; content: ReactNode };
export const docLinkClass = "text-docs-link underline decoration-docs-link/40 underline-offset-4 hover:decoration-docs-link";
export function DocsArticle({ title, description, category = "Get started", sections, children, next }: { title: string; description: string; category?: string; sections: DocSection[]; children?: ReactNode; next?: { href: string; label: string } }) {
  return <div className="flex min-w-0 flex-1 justify-center">
    <main id="main-content" className="min-w-0 w-full max-w-[860px] px-5 py-10 sm:px-10 lg:px-12 xl:px-16 lg:py-12">
      <article className="space-y-8">
        <header className="space-y-4">
          <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground"><Link className="hover:text-foreground" href="/docs/how-it-works">Docs</Link><span aria-hidden="true"> / </span>{category === "Route guides" ? <Link href="/docs/routes" className="hover:text-foreground">{category}</Link> : category}</nav>
          <h1 className="text-3xl leading-tight font-semibold tracking-[-0.035em] sm:text-4xl sm:leading-11">{title}</h1>
          <p className="text-[17px] leading-7 text-muted-foreground">{description}</p>
        </header>
        {children}
        <details className="rounded-lg border border-border p-4 xl:hidden"><summary className="cursor-pointer text-sm font-medium">On this page</summary><ul className="mt-3 space-y-2">{sections.map((section) => <li key={section.id}><a className="text-sm text-docs-link" href={`#${section.id}`}>{section.title}</a></li>)}</ul></details>
        {sections.map((section) => <section key={section.id} id={section.id} className="scroll-mt-8 space-y-3"><h2 className="text-[23px] leading-8 font-semibold tracking-[-0.02em]">{section.title}</h2><div className="space-y-4 text-base leading-7 text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5">{section.content}</div></section>)}
        <footer className="flex flex-wrap justify-between gap-4 border-t border-border pt-6 text-sm text-docs-link"><Link href={category === "Route guides" ? "/docs/routes" : "/"}>← {category === "Route guides" ? "All route guides" : "Back to bridge"}</Link>{next && <Link href={next.href}>{next.label} →</Link>}</footer>
      </article>
    </main>
    <aside className="hidden w-56 shrink-0 pt-14 pr-6 pl-2 xl:block"><nav aria-label="On this page" className="sticky top-8"><p className="mb-5 text-xs font-semibold uppercase tracking-wide">On this page</p><ul className="space-y-4">{sections.map((section) => <li key={section.id}><a href={`#${section.id}`} className="block border-l-2 border-border pl-3.5 text-[13px] leading-5 text-muted-foreground hover:border-docs-link hover:text-docs-link">{section.title}</a></li>)}</ul></nav></aside>
  </div>;
}
