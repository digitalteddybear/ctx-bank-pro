import { NextRequest, NextResponse } from "next/server";
import { documentRepository } from "@/lib/server/document-repository";
import { loadLeadGraph } from "@/lib/server/lead-corpus";
import { workspaceSessionRole } from "@/lib/server/operator-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SourceManifest {
  generatedAt: string;
  sourceCount: number;
  textualCount: number;
  totalBytes: number;
  byExtension: Record<string, number>;
}

async function readSourceManifest(): Promise<SourceManifest | null> {
  const graph = await loadLeadGraph();
  const leads = graph.nodes.filter((node) => node.id.startsWith("lead-"));
  return {
    generatedAt: graph.generatedAt,
    sourceCount: leads.length,
    textualCount: leads.length,
    totalBytes: leads.reduce((sum, node) => sum + Buffer.byteLength(node.sources[0]?.excerpt ?? ""), 0),
    byExtension: { ".md": leads.length },
  };
}

export async function GET(request:NextRequest) {
  if(await workspaceSessionRole(request)==="guest"){
    return NextResponse.json({dashboard:{available:true}},{headers:{"Cache-Control":"no-store"}});
  }
  const [manifest, documents] = await Promise.all([
    readSourceManifest(),
    documentRepository.list(),
  ]);

  return NextResponse.json(
    {
      corpus: {
        sourceCount: manifest?.sourceCount ?? 0,
        textualCount: manifest?.textualCount ?? 0,
        totalBytes: manifest?.totalBytes ?? 0,
        indexedAt: manifest?.generatedAt ?? null,
        byExtension: manifest?.byExtension ?? {},
      },
      ingestion: {
        total: documents.length,
        pending: documents.filter((document) => document.status === "ready_for_agent").length,
        processed: documents.filter((document) => document.status === "processed").length,
        failed: documents.filter((document) => document.status === "failed").length,
      },
      persistence: process.env.GRAPH_PERSISTENCE ?? "file",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
