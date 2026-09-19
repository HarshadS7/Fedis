import { LandingPage } from "@/components/landing/landing-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Economic enforcement for autonomous agents",
  description:
    "fedis — bonded execution, on-chain slashing, and risk visibility for every paid agent task on Monad.",
};

export default function HomePage() {
  return <LandingPage />;
}
