import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Fides",
    template: "%s — Fides",
  },
  description:
    "Economic enforcement for autonomous agents — bonded liability, on-chain slashing, and risk visibility on Monad.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
