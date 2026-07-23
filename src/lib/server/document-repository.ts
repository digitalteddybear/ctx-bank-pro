import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { graphRepository } from "./persistent-repository";

export const ACCEPTED_DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".csv",
  ".html",
  ".htm",
  ".rtf",
] as const;

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export interface DocumentChunk {
  id: string;
  index: number;
  text: string;
  characterCount: number;
}

export interface IngestionDocument {
  id: string;
  originalName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storedPath: string;
  status: "ready_for_agent" | "processed" | "failed";
  uploadedAt: string;
  completedAt?: string;
  extractedCharacters: number;
  sourceNodeId?: string;
  chunks: DocumentChunk[];
  agentSummary?: string;
  derivedNodeIds?: string[];
  error?: string;
}

const inboxRoot =
  process.env.INGESTION_ROOT ??
  path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "inbox");
const filesRoot = path.join(inboxRoot, "files");
const recordsRoot = path.join(inboxRoot, "records");

function safeName(name: string) {
  const base = path.basename(name).normalize("NFKC");
  const cleaned = base.replace(/[^a-zA-Z0-9._ -]/g, "-").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 180) || "document";
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripMarkup(value: string) {
  return normalizeText(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/gi, "'"),
  );
}

function stripRtf(value: string) {
  return normalizeText(
    value
      .replace(/\\par[d]?/g, "\n")
      .replace(/\\'[0-9a-fA-F]{2}/g, " ")
      .replace(/\\[a-zA-Z]+-?\d* ?/g, " ")
      .replace(/[{}]/g, " "),
  );
}

async function extractDocumentText(buffer: Buffer, extension: string) {
  if (extension === ".pdf") {
    const { extractText } = await import("unpdf");
    const result = await extractText(new Uint8Array(buffer), { mergePages: true });
    return normalizeText(result.text);
  }

  if (extension === ".docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return normalizeText(result.value);
  }

  const raw = buffer.toString("utf8");
  if (extension === ".html" || extension === ".htm") return stripMarkup(raw);
  if (extension === ".rtf") return stripRtf(raw);
  return normalizeText(raw);
}

function chunkDocument(text: string, documentId: string): DocumentChunk[] {
  const targetSize = 1_600;
  const overlap = 180;
  const chunks: DocumentChunk[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + targetSize);
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      const sentenceBreak = text.lastIndexOf(". ", end);
      const preferredBreak = Math.max(paragraphBreak, sentenceBreak);
      if (preferredBreak > cursor + targetSize * 0.55) {
        end = preferredBreak + (preferredBreak === sentenceBreak ? 1 : 0);
      }
    }

    const value = text.slice(cursor, end).trim();
    if (value) {
      chunks.push({
        id: `${documentId}:chunk:${chunks.length}`,
        index: chunks.length,
        text: value,
        characterCount: value.length,
      });
    }

    if (end >= text.length) break;
    cursor = Math.max(cursor + 1, end - overlap);
  }

  return chunks;
}

async function saveRecord(record: IngestionDocument) {
  await fs.mkdir(recordsRoot, { recursive: true });
  const target = path.join(recordsRoot, `${record.id}.json`);
  const temporary = `${target}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(record, null, 2), "utf8");
  await fs.rename(temporary, target);
}

async function readRecord(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return null;
  try {
    return JSON.parse(
      await fs.readFile(path.join(recordsRoot, `${id}.json`), "utf8"),
    ) as IngestionDocument;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export const documentRepository = {
  async ingest(input: { name: string; type: string; buffer: Buffer }) {
    const originalName = safeName(input.name);
    const extension = path.extname(originalName).toLowerCase();
    if (!ACCEPTED_DOCUMENT_EXTENSIONS.includes(extension as never)) {
      throw new Error(`Unsupported document type: ${extension || "unknown"}`);
    }
    if (!input.buffer.length || input.buffer.length > MAX_DOCUMENT_BYTES) {
      throw new Error(`Document must be between 1 byte and ${MAX_DOCUMENT_BYTES} bytes`);
    }

    const id = `document-${randomUUID()}`;
    const storedName = `${id}-${originalName}`;
    const storedPath = path.join("data", "inbox", "files", storedName);
    const uploadedAt = new Date().toISOString();
    await fs.mkdir(filesRoot, { recursive: true });
    await fs.writeFile(path.join(filesRoot, storedName), input.buffer);

    let text = "";
    let extractionError: string | undefined;
    try {
      text = await extractDocumentText(input.buffer, extension);
      if (!text) extractionError = "No machine-readable text was extracted.";
    } catch (error) {
      extractionError = error instanceof Error ? error.message : "Text extraction failed.";
    }

    const chunks = text ? chunkDocument(text, id) : [];
    const record: IngestionDocument = {
      id,
      originalName,
      extension,
      mimeType: input.type || "application/octet-stream",
      sizeBytes: input.buffer.length,
      sha256: createHash("sha256").update(input.buffer).digest("hex"),
      storedPath,
      status: extractionError ? "failed" : "ready_for_agent",
      uploadedAt,
      extractedCharacters: text.length,
      chunks,
      error: extractionError,
    };

    const sourceNode = await graphRepository.addNode(
      {
        label: originalName,
        type: "source",
        description: extractionError
          ? `Uploaded document awaiting manual extraction. ${extractionError}`
          : `Uploaded document prepared for agent analysis in ${chunks.length} RAG chunks.`,
        status: "review",
        authority: "supporting",
        confidence: extractionError ? 0.35 : 0.65,
        tags: ["document-upload", "rag-inbox", extension.slice(1), record.status],
        sources: [
          {
            sourceId: id,
            path: storedPath,
            locator: extractionError ? "Extraction pending" : `${chunks.length} extracted chunks`,
          },
        ],
      },
      "Document ingestion",
    );
    record.sourceNodeId = sourceNode.id;
    await saveRecord(record);
    return record;
  },

  async list() {
    try {
      const files = (await fs.readdir(recordsRoot)).filter((file) => file.endsWith(".json"));
      const records = await Promise.all(
        files.map((file) => readRecord(file.replace(/\.json$/, ""))),
      );
      return records
        .filter((record): record is IngestionDocument => Boolean(record))
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  },

  async get(id: string) {
    return readRecord(id);
  },

  async complete(
    id: string,
    input: { summary: string; derivedNodeIds?: string[] },
  ) {
    const record = await readRecord(id);
    if (!record) return null;
    record.status = "processed";
    record.completedAt = new Date().toISOString();
    record.agentSummary = input.summary;
    record.derivedNodeIds = input.derivedNodeIds ?? [];
    await saveRecord(record);
    if (record.sourceNodeId) {
      await graphRepository.updateNode(
        record.sourceNodeId,
        {
          status: "verified",
          description: `${input.summary} Parsed into the knowledge graph by an agent.`,
          tags: record.extension
            ? ["document-upload", "rag-processed", record.extension.slice(1)]
            : ["document-upload", "rag-processed"],
        },
        "MCP agent",
      );
    }
    return record;
  },
};
