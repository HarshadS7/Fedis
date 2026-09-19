import { AgentRiskTerminal } from "@/components/agent-risk-terminal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent Risk Terminal",
  description:
    "Live vault risk dashboard — capital, slashes, task lifecycle, and Monad parallelism benchmarks.",
};

export default function TerminalPage() {
  return <AgentRiskTerminal />;
}
