import { NextResponse } from "next/server";
import { graphRepository } from "@/lib/server/persistent-repository";

export const runtime = "nodejs";

export async function GET() {
  const metrics = await graphRepository.metrics();
  return NextResponse.json({
    status: "healthy",
    service: "asp-invest-ctx-bank",
    schemaVersion: "1.0",
    persistence: process.env.GRAPH_PERSISTENCE ?? "file",
    metrics,
    timestamp: new Date().toISOString(),
  });
}
