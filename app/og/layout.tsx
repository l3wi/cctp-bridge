import type { Metadata } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = { title: "Social image preview | CCTP Bridge", robots: { index: false, follow: true } };
export default function OgLayout({ children }: { children: ReactNode }) { return children; }
