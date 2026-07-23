import { NextRequest, NextResponse } from "next/server";
import {
  ACCEPTED_DOCUMENT_EXTENSIONS,
  documentRepository,
  MAX_DOCUMENT_BYTES,
} from "@/lib/server/document-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const documents = await documentRepository.list();
  return NextResponse.json(
    documents.map(({ chunks, ...document }) => ({
      ...document,
      chunkCount: chunks.length,
    })),
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A document file is required." }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "Documents are limited to 25 MB." }, { status: 413 });
  }

  try {
    const document = await documentRepository.ingest({
      name: file.name,
      type: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    const { chunks, ...response } = document;
    return NextResponse.json(
      { ...response, chunkCount: chunks.length },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Document upload or text extraction failed.",
        acceptedExtensions: ACCEPTED_DOCUMENT_EXTENSIONS,
      },
      { status: 400 },
    );
  }
}
