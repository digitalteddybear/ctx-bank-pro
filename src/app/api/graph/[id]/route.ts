import { NextRequest, NextResponse } from "next/server";
import { graphRepository } from "@/lib/server/persistent-repository";
import { nodePatchSchema } from "@/lib/server/validation";
import { requireAgentWrite } from "@/lib/server/agent-write-auth";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const rejection = requireAgentWrite(request);
  if (rejection) return rejection;
  const { id } = await context.params;
  const parsed = nodePatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid patch", issues: parsed.error.issues }, { status: 400 });
  }
  const node = await graphRepository.updateNode(id, parsed.data);
  if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });
  return NextResponse.json(node);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const rejection = requireAgentWrite(request);
  if (rejection) return rejection;
  const { id } = await context.params;
  const node = await graphRepository.softDeleteNode(id);
  if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });
  return NextResponse.json({ removed: true, recoverable: true, node });
}
