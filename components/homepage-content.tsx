import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Image from "next/image";
import Link from "next/link";

const networks = [
  { name: "Ethereum", icon: "/1.svg" },
  { name: "Base", icon: "/8453.svg" },
  { name: "Arbitrum", icon: "/42161.svg" },
  { name: "Optimism", icon: "/10.svg" },
];

const linkClass = "text-sm text-link transition-colors hover:text-foreground";

export function HomepageContent() {
  return (
    <>
      <div className="border-t border-border bg-surface">
        <div className="mx-auto max-w-[968px] px-6 pt-10 pb-8">
          <section aria-labelledby="native-usdc-heading" className="space-y-7 pb-9">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 id="native-usdc-heading" className="text-[22px] leading-7 font-semibold tracking-tight">Bridge native USDC across chains</h2>
              <Link href="/docs/how-it-works" className={linkClass}>How it works ↗</Link>
            </div>
            <p className="text-[15px] leading-[25px] text-muted-foreground">
              CCTP burns USDC on the source network and mints native USDC on the destination after Circle verifies the transfer. Use supported EVM networks or Solana, with no wrapped USDC on arrival.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {networks.map((network) => (
                <span key={network.name} className="flex items-center gap-2.5 rounded-lg border border-border px-3.5 py-2.5 text-sm">
                  <Image src={network.icon} width={20} height={20} alt="" />
                  {network.name}
                </span>
              ))}
              <Link href="/docs/routes/ethereum-to-base" className={`${linkClass} px-2 py-2.5`}>Route guides ↗</Link>
            </div>
          </section>
          <section aria-label="Frequently asked questions">
            <Accordion type="single" collapsible defaultValue="faq-0">
            <AccordionItem value="faq-0">
              <AccordionTrigger>
                What’s the difference between Fast and Standard?
                
                
              </AccordionTrigger>
              <AccordionContent>
              <div className="mt-3 space-y-3 sm:pr-16">
                <p className="text-sm leading-6 text-muted-foreground">Standard waits for the required chain confirmations. Fast offers earlier attestation on eligible routes for a fee. Compare the estimate above, including the amount you’ll receive. Gas is separate.</p>
                <Link href="/docs/fees" className={linkClass}>Fees and transfer times ↗</Link>
              </div>
            </AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq-1">
              <AccordionTrigger>
                My USDC hasn’t arrived. How do I resume a transfer?
                
                
              </AccordionTrigger>
              <AccordionContent>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:pr-16">Open <Link href="/bridge" className="text-link hover:underline">Track transfer</Link> with your source network and transaction hash to check its status and continue the destination claim when it is ready.</p>
            </AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq-2" id="about">
              <AccordionTrigger>
                Is cctp.io operated by Circle?
                
                
              </AccordionTrigger>
              <AccordionContent>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:pr-16">cctp.io is an independent interface built by lewi. It uses Circle’s Cross-Chain Transfer Protocol to transfer native USDC.</p>
            </AccordionContent>
            </AccordionItem>
            </Accordion>
          </section>
        </div>
      </div>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[968px] flex-wrap items-center justify-between gap-5 px-6 py-6 text-[13px] text-muted-foreground">
          <p>made by lewi · Independent interface for Circle CCTP</p>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-5">
            <Link href="/docs/how-it-works" className="hover:text-foreground">About</Link>
            <a href="https://t.me/twpks" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Support ↗</a>
            <Link href="/docs/how-it-works" className="hover:text-foreground">Docs ↗</Link>
            <a href="https://x.com/lewifree" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">X ↗</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
