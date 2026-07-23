import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { documentRepository } from "@/lib/server/document-repository";

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
  try {
    return JSON.parse(
      await fs.readFile(
        path.join(
          /*turbopackIgnore: true*/ process.cwd(),
          "data",
          "generated",
          "source-manifest.json",
        ),
        "utf8",
      ),
    ) as SourceManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function GET() {
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
