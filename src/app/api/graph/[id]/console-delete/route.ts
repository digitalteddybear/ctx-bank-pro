import { NextRequest, NextResponse } from "next/server";
import { graphRepository } from "@/lib/server/persistent-repository";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let body: { confirmation?: unknown };

  try {
    body = (await request.json()) as { confirmation?: unknown };
  } catch {
    return NextResponse.json({ error: "A deletion confirmation is required." }, { status: 400 });
  }

  const confirmation =
    typeof body.confirmation === "string" ? body.confirmation.trim().toLowerCase() : "";

  if (confirmation !== "delete") {
    return NextResponse.json({ error: 'Type "delete" to confirm this action.' }, { status: 400 });
  }

  const { id } = await context.params;
  const node = await graphRepository.softDeleteNode(id, "Console user");

  if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });

  return NextResponse.json({ removed: true, recoverable: true, node });
}
