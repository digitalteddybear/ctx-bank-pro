import { NextRequest, NextResponse } from "next/server";
import { graphRepository } from "@/lib/server/persistent-repository";
import { requireAgentWrite } from "@/lib/server/agent-write-auth";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const rejection = requireAgentWrite(request);
  if (rejection) return rejection;
  const { id } = await context.params;
  const node = await graphRepository.restoreNode(id);
  if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });
  return NextResponse.json(node);
}
