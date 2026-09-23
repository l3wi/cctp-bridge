import Link from "next/link";
import { Check } from "lucide-react";
import { DocsArticle, docLinkClass } from "@/components/docs/docs-article";
import { docsMetadata } from "@/components/docs/content";

export const metadata = docsMetadata("Fees and transfer times", "Understand CCTP Fast and Standard transfers, application fees, network gas, and the amount of USDC you receive.", "/docs/fees");
export default function FeesPage() {
  return <DocsArticle title="Fees and transfer times" description="Review the full cost of a transfer: the USDC transfer fee and the network gas needed to send and claim." next={{ href: "/docs/routes", label: "Route guides" }} sections={[
    { id: "transfer-fees", title: "Transfer fees", content: <p>Fast transfers can include two separate USDC charges: Circle’s protocol fee for Fast attestation and CCTP.io’s application fee. The application fee is deducted from the entered amount before the remaining USDC is burned; the protocol fee reduces the amount minted on the destination. The bridge calculates the applicable quote for your selected route and amount. Use Fee Details in the bridge to inspect the current breakdown.</p> },
    { id: "network-gas", title: "Network gas", content: <ul><li><strong>Source network:</strong> pay for the burn transaction and any required token approval using the source network’s native token.</li><li><strong>Destination network:</strong> keep native tokens on the destination to submit the claim. EVM networks use their native gas token; Solana uses SOL.</li><li>Wallet gas estimates can change with network conditions. Gas is separate from a fee denominated in USDC. Solana transactions can also require SOL to fund account rent, including the message account created during a burn.</li></ul> },
    { id: "received-amount", title: "The amount you receive", content: <p>Check the received amount displayed in the quote before confirming. Applicable USDC fees reduce the amount delivered; network gas is paid separately in the relevant network’s native token. Changing the amount, route, or transfer speed can change the quote.</p> },
    { id: "transfer-time", title: "How long does a transfer take?", content: <><p>Completion includes the source transaction, Circle attestation, and destination mint. Fast can provide earlier attestation on eligible routes. Standard uses the source network’s standard confirmation requirement.</p><p>The estimate is not a deadline. Congestion, attestation delays, and waiting for a wallet confirmation can extend the transfer. If a source transaction has already been confirmed, <Link className={docLinkClass} href="/docs/recover">track that transfer</Link> before starting another.</p></> },
    { id: "heavy-bridge-use", title: "Heavy bridge use", content: <p>Standard waits for the source network’s required confirmations. A 100 USDC fee applies per cumulative 1 million USDC of Standard bridge volume per wallet, combined across source chains for the same address. The fee is deducted from the entered amount on the transfer that reaches the threshold.</p> },
  ]}>
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm leading-6">
          <caption className="sr-only">Fast and Standard fee comparison</caption>
          <thead className="bg-muted text-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium">Transfer</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">Extra fees</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">Gas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr>
              <th scope="row" className="px-4 py-3 text-left font-medium">Fast</th>
              <td className="px-4 py-3 text-center"><Check className="mx-auto size-4" aria-hidden="true" /><span className="sr-only">Yes</span></td>
              <td className="px-4 py-3 text-center"><Check className="mx-auto size-4" aria-hidden="true" /><span className="sr-only">Yes</span></td>
            </tr>
            <tr>
              <th scope="row" className="px-4 py-3 text-left font-medium">Standard</th>
              <td className="px-4 py-3 text-center text-muted-foreground">No</td>
              <td className="px-4 py-3 text-center"><Check className="mx-auto size-4" aria-hidden="true" /><span className="sr-only">Yes</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </DocsArticle>;
}
