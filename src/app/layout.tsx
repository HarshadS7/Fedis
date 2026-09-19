import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fedis — Economic enforcement for the agentic web",
  description: "A liability layer for autonomous work: bond the task, verify the result, and compensate the buyer when the promise breaks.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
