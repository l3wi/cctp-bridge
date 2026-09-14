import { ArrowUpRight } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Link from "next/link";

const questions = [
  ["Where do I find my transaction hash?", "Open your wallet’s activity or the explorer for the network you sent from. Copy the transaction hash for the USDC bridge transaction. For Solana, use the transaction signature. A wallet address or destination claim hash won’t identify the source transfer."],
  ["Why can’t the transfer be found?", "Check that you selected the network where you sent the USDC and copied the full source transaction hash. This lookup searches Circle CCTP v2 transfers. If you just submitted the transaction, allow time for it to be confirmed and indexed, then try again."],
  ["Why is my transfer still pending?", "The source transaction, Circle attestation, or destination claim may still be pending. Transfer timing depends on the source network and transfer type. The transfer detail page shows the available progress and next action."],
  ["Can I resume after closing the browser?", "Yes. Use the source network and transaction hash to find the transfer again. Once the attestation is ready, follow the destination claim steps shown on the transfer page. Looking up a transfer does not send another transfer."],
  ["Do I need to connect a wallet?", "You can begin a lookup without connecting a wallet. Completing a claim requires a wallet on the destination network and gas for the transaction. For Solana recovery, the recipient wallet address must match the recipient account recorded in the transfer."],
];

export function TrackingHelp() {
  return (
    <>
      <section aria-labelledby="tracking-help-heading" className="border-t border-border bg-surface">
        <div className="mx-auto max-w-[968px] px-6 py-12">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <h2 id="tracking-help-heading" className="text-[22px] font-semibold tracking-tight">Help with your transfer</h2>
            <Link href="/docs/recover" className="text-sm text-link hover:underline">Read the recovery guide <ArrowUpRight className="inline-block size-3.5 align-text-bottom" aria-hidden="true" /></Link>
          </div>
          <Accordion type="single" collapsible defaultValue="faq-0">
          {questions.map(([question, answer], index) => (
            <AccordionItem key={question} value={`faq-${index}`}>
              <AccordionTrigger>
                {question}
                
                
              </AccordionTrigger>
              <AccordionContent>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:pr-16">{answer}</p>
            </AccordionContent>
            </AccordionItem>
          ))}
          </Accordion>
        </div>
      </section>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[968px] flex-wrap justify-between gap-5 px-6 py-6 text-[13px] text-muted-foreground">
          <p>made by lewi · Independent interface for Circle CCTP</p>
          <nav aria-label="Footer navigation" className="flex gap-5">
            <Link href="/" className="hover:text-foreground">Bridge</Link>
            <Link href="/docs/how-it-works" className="hover:text-foreground">Docs <ArrowUpRight className="inline-block size-3.5 align-text-bottom" aria-hidden="true" /></Link>
            <a href="https://t.me/twpks" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Support <ArrowUpRight className="inline-block size-3.5 align-text-bottom" aria-hidden="true" /></a>
          </nav>
        </div>
      </footer>
    </>
  );
}
