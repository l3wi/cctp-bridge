import Link from "next/link";
import { DocsArticle, docLinkClass } from "@/components/docs/docs-article";
import { docsMetadata } from "@/components/docs/content";

export const metadata = docsMetadata(
  "Fast & Standard transfers",
  "Compare CCTP Fast and Standard transfers, source-chain attestation times, confirmation requirements, and fees.",
  "/docs/transfer-speed",
);

// Editorial snapshot, not transaction confirmation configuration.
// Circle: https://developers.circle.com/cctp/concepts/finality-and-block-confirmations
// Reviewed 2026-09-23; scoped to this app's mainnet source chains.
const attestationTimes = [
  ["Ethereum", "~20s", "~15–19min"],
  ["Arbitrum", "~8s", "~15–19min"],
  ["Base", "~8s", "~15–19min"],
  ["Optimism (OP Mainnet)", "~8s", "~15–19min"],
  ["Solana", "~8s", "~25s"],
  ["Avalanche", null, "~8s"],
  ["Codex", "~8s", "~15–19min"],
  ["Cronos", null, "~0.5s"],
  ["EDGE", "~8s", "~16–21min"],
  ["HyperEVM", null, "~5s"],
  ["Injective", null, "~0.65s"],
  ["Ink", "~8s", "~30min"],
  ["Linea", "~8s", "~6–32h"],
  ["Monad", null, "~5s"],
  ["Morph", "~8s", "~20–30min"],
  ["Pharos", null, "~7s"],
  ["Plume", "~8s", "~15–19min"],
  ["Polygon PoS", null, "~8s"],
  ["Sei", null, "~5s"],
  ["Sonic", null, "~8s"],
  ["Unichain", "~8s", "~15–19min"],
  ["World Chain", "~8s", "~15–19min"],
  ["X Layer", "~8s", "~15–19min"],
  ["XDC", null, "~10s"],
] as const;

const comparison = [
  ["Attestation", "Earlier confirmation", "Source-chain finality"],
  ["Availability", "Eligible sources; subject to Circle’s allowance", "Includes sources without Fast"],
  ["USDC fees", "Circle’s Fast fee plus the app fee; review the live quote", "No circle fees"],
  ["Network gas", "Paid separately", "Paid separately"],
] as const;

export default function TransferSpeedPage() {
  return (
    <DocsArticle
      title="Fast & Standard transfers"
      description="Choose a transfer speed by comparing the wait for attestation and the fees in your quote."
      next={{ href: "/docs/fees", label: "Fees and transfer times" }}
      sections={[
        {
          id: "comparison",
          title: "Fast vs Standard",
          content: <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm leading-6">
                <caption className="sr-only">Fast and Standard transfer comparison</caption>
                <thead className="bg-muted text-foreground">
                  <tr>{["Compare", "Fast", "Standard"].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {comparison.map(([label, fast, standard]) => <tr key={label}>
                    <th scope="row" className="px-4 py-3 align-top font-medium text-foreground">{label}</th>
                    <td className="px-4 py-3 align-top">{fast}</td>
                    <td className="px-4 py-3 align-top">{standard}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <p>Both routes deliver native USDC. Check the bridge quote before confirming. For deductions and cumulative thresholds, see <Link href="/docs/fees" className={docLinkClass}>the fee breakdown</Link>.</p>
          </>,
        },
        {
          id: "source-chain-timing",
          title: "Timing by source chain",
          content: <>
            <p>Circle’s approximate attestation times for the app’s mainnet source chains—not total delivery times.</p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm leading-6" aria-describedby="timing-key">
                <caption className="sr-only">Average attestation time by source chain and transfer speed</caption>
                <thead className="bg-muted text-foreground">
                  <tr>{["Source chain", "Fast", "Standard"].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {attestationTimes.map(([chain, fast, standard]) => <tr key={chain}>
                    <th scope="row" className="px-4 py-3 font-medium text-foreground">{chain}</th>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{fast ?? <><span aria-hidden="true">—</span><span className="sr-only">Unavailable</span></>}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{standard}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <p id="timing-key" className="text-sm">s = seconds · min = minutes · h = hours. — means Fast is unavailable as a source.</p>
            <p className="text-sm">Source: <a href="https://developers.circle.com/cctp/concepts/finality-and-block-confirmations" className={docLinkClass}>Circle’s finality and block confirmations</a>. Reviewed <time dateTime="2026-09-23">23 September 2026</time>; estimates can change.</p>
          </>,
        },
        {
          id: "timing-details",
          title: "What affects timing?",
          content: <>
            <p>For many Ethereum L2s, Standard depends on Ethereum finality—not just local blocks. Batch publication can add a wait before L1 confirmations.</p>
            <p>Wallet approvals, source inclusion, and the destination claim also take time. Attestation is permission to mint, not proof that the recipient has received USDC.</p>
            <p>If a burn is already confirmed, <Link href="/docs/recover" className={docLinkClass}>track or resume that transfer</Link> rather than submitting another.</p>
          </>,
        },
      ]}
    />
  );
}
