import { NextResponse } from "next/server";
import { MOCK_VAULTS } from "@/lib/mock";

/** Stub until Person B wires getAllVaultInfo() — shape matches GO.md */
export async function GET() {
  const started = Date.now();
  const durationMs = Date.now() - started;

  console.log(
    `[api] GET /api/vaults -> 200 in ${durationMs}ms (${MOCK_VAULTS.length} vaults, stub)`,
  );

  return NextResponse.json(MOCK_VAULTS);
}
