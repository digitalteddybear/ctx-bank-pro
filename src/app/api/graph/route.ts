import { NextRequest, NextResponse } from "next/server";
import { graphRepository } from "@/lib/server/persistent-repository";
import { newLinkSchema, newNodeSchema } from "@/lib/server/validation";
import { requireAgentWrite } from "@/lib/server/agent-write-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query");
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  const depth = Number(request.nextUrl.searchParams.get("depth") ?? "1");

  if (query !== null) {
    return NextResponse.json({
      query,
      results: await graphRepository.search(query, 20),
    });
  }

  if (nodeId) {
    const node = await graphRepository.node(nodeId);
    if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });
    return NextResponse.json({
      node,
      neighborhood: await graphRepository.neighborhood(nodeId, Math.min(Math.max(depth, 1), 3)),
    });
  }

  return NextResponse.json(await graphRepository.snapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const rejection = requireAgentWrite(request);
  if (rejection) return rejection;
  const body = (await request.json()) as { kind?: string; data?: unknown };

  if (body.kind === "node") {
    const parsed = newNodeSchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid node", issues: parsed.error.issues }, { status: 400 });
    }
    return NextResponse.json(await graphRepository.addNode(parsed.data), { status: 201 });
  }

  if (body.kind === "link") {
    const parsed = newLinkSchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid link", issues: parsed.error.issues }, { status: 400 });
    }
    const link = await graphRepository.addLink(parsed.data);
    if (!link) {
      return NextResponse.json(
        { error: "Link is invalid, duplicated, or references a missing node" },
        { status: 409 },
      );
    }
    return NextResponse.json(link, { status: 201 });
  }

  return NextResponse.json({ error: "Expected kind to be node or link" }, { status: 400 });
}
