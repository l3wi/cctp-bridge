import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Find a transfer | CCTP Bridge",
  description: "Find a Circle CCTP v2 transfer using its source network and transaction hash, then view progress or resume a claim.",
  robots: { index: false, follow: true },
};
export default function BridgeLayout({ children }: { children: ReactNode }) {
  return children;
}
