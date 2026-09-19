import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fides — Agent Risk Terminal",
  description:
    "Economic enforcement and agent vault risk dashboard for the agentic web.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
