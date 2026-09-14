import Link from "next/link";
import { DocsArticle, docLinkClass } from "@/components/docs/docs-article";
import { docsMetadata } from "@/components/docs/content";

export const metadata = docsMetadata("Fees and transfer times", "Understand CCTP Fast and Standard transfers, application fees, network gas, and the amount of USDC you receive.", "/docs/fees");
export default function FeesPage() {
  return <DocsArticle title="Fees and transfer times" description="Review the full cost of a transfer: the USDC transfer fee and the network gas needed to send and claim." next={{ href: "/docs/routes", label: "Route guides" }} sections={[
    { id: "transfer-fees", title: "Transfer fees", content: <><p>Fast transfers can include a Circle protocol fee and an application fee. The bridge calculates the applicable quote for your selected route and amount. Use Fee Details in the bridge to inspect the current breakdown.</p><p>Standard waits for the source network’s required confirmations. Do not interpret a zero transfer fee as a transaction with no cost: wallet transactions still require network gas.</p></> },
    { id: "network-gas", title: "Network gas", content: <ul><li><strong>Source network:</strong> pay for the burn transaction and any required token approval using the source network’s native token.</li><li><strong>Destination network:</strong> keep native tokens on the destination to submit the claim. EVM networks use their native gas token; Solana uses SOL.</li><li>Wallet gas estimates can change with network conditions. Gas is separate from a fee denominated in USDC.</li></ul> },
    { id: "received-amount", title: "The amount you receive", content: <p>Check the received amount displayed in the quote before confirming. Applicable USDC fees reduce the amount delivered; network gas is paid separately in the relevant network’s native token. Changing the amount, route, or transfer speed can change the quote.</p> },
    { id: "transfer-time", title: "How long does a transfer take?", content: <><p>Completion includes the source transaction, Circle attestation, and destination mint. Fast can provide earlier attestation on eligible routes. Standard uses the source network’s standard confirmation requirement.</p><p>The estimate is not a deadline. Congestion, attestation delays, and waiting for a wallet confirmation can extend the transfer. If a source transaction has already been confirmed, <Link className={docLinkClass} href="/docs/recover">track that transfer</Link> before starting another.</p></> },
  ]} />;
}
