import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { GraphSnapshot, KnowledgeNode } from "../graph/types";
import { humanizeValue, mailboxResultPhrase, naturalName } from "../graph/lead-dossier";

// This adapter consumes the Python pipeline's retained dossiers directly.
// The quarantine and the unfiltered 1,000-record JSON are deliberately separate.
export const leadCorpusRoot = process.env.CTX_LEAD_CORPUS_PATH ?? path.join(
  /*turbopackIgnore: true*/ process.cwd(), "../../RAG/corpus/chunks/normalized-contacts",
);

const words = (value: string) => value.replaceAll("_", " ").toLowerCase();
const field = (text: string, name: string) => {
  const line = text.split("\n").find((item) => item.startsWith(`- **${name}:** `));
  return line?.split(":** ").slice(1).join(":** ").trim() ?? "";
};

export function describeLead(markdown: string): string {
  const name = naturalName(field(markdown, "Resolved Name") || field(markdown, "Raw Full Name") || field(markdown, "Raw Email"));
  const email = field(markdown, "Raw Email");
  const classification = field(markdown, "Classification");
  const smtp = field(markdown, "Mailbox SMTP Status");
  const phone = field(markdown, "Phone E.164");
  const confidence = classification.match(/Confidence: ([\d.]+)/)?.[1];
  const classificationLabel = humanizeValue(classification).replace(/ \(\d+% confidence\)$/, "");
  const confidenceText = confidence ? ` with ${Math.round(Number(confidence) * 100)}% confidence` : "";
  return `${name} is an ASP Private Capital prospect retained after Phase 1 validation. The recorded email address is ${email}${phone ? `, and the recorded phone number is ${phone}` : ""}. The record is classified as ${classificationLabel}${confidenceText}. The investor-fit hypothesis is ${field(markdown, "Investor Fit Hypothesis") || "not recorded"}. The mailbox check returned ${mailboxResultPhrase(smtp)}.`;
}

let cached: { signature: string; graph: GraphSnapshot } | undefined;
const filesystemConcurrency = 32;

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  mapper: (value: T, index: number) => Promise<R>,
  concurrency = filesystemConcurrency,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

export async function loadLeadGraph(): Promise<GraphSnapshot> {
  const segments = (await fs.readdir(leadCorpusRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  const files = (await Promise.all(segments.map(async (segment) =>
    (await fs.readdir(path.join(leadCorpusRoot, segment.name)))
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.join(segment.name, name)),
  ))).flat().sort();
  if (!files.length) throw new Error(`No retained lead dossiers found in ${leadCorpusRoot}`);
  const stats = await mapWithConcurrency(files, (file) => fs.stat(path.join(leadCorpusRoot, file)));
  const signature = createHash("sha256").update(files.map((file, i) => `${file}:${stats[i].mtimeMs}:${stats[i].size}`).join("\n")).digest("hex");
  if (cached?.signature === signature) return structuredClone(cached.graph);
  const generatedAt = new Date(Math.max(...stats.map((stat) => stat.mtimeMs))).toISOString();
  const graph: GraphSnapshot = { schemaVersion: "1.0", generatedAt, nodes: [], links: [], activities: [] };
  const base = { status: "review" as const, authority: "operational" as const, confidence: 1, tags: [], sources: [], createdAt: generatedAt, updatedAt: generatedAt };
  graph.nodes.push({ ...base, id: "asp-invest", label: "ASP Private Capital", type: "organization", description: `Retained lead dossiers from the 1,000-contact Phase 1 sample. ${files.length} retained contacts; quarantine is stored separately.` });
  const groups = new Set<string>();
  const ids = new Set<string>();
  const documents = await mapWithConcurrency(files, (file) => fs.readFile(path.join(leadCorpusRoot, file), "utf8"));
  for (const [index, markdown] of documents.entries()) {
    const hubspotId = markdown.match(/^# HubSpot ID: `([^`]+)`/m)?.[1];
    if (!hubspotId || ids.has(hubspotId)) throw new Error(`Missing or duplicate HubSpot ID: ${files[index]}`);
    ids.add(hubspotId);
    const classification = field(markdown, "Classification").split(" (")[0] || "UNKNOWN";
    const groupId = `segment-${classification.toLowerCase()}`;
    if (!groups.has(groupId)) {
      groups.add(groupId);
      graph.nodes.push({ ...base, id: groupId, label: words(classification), type: "audience", description: `Contacts classified as ${words(classification)} by the Python pipeline. Classification is not investor qualification.` });
      graph.links.push({ id: `link-${groupId}`, source: "asp-invest", target: groupId, type: "contains", strength: 1, verified: true, createdAt: generatedAt, updatedAt: generatedAt });
    }
    const sourcePath = `RAG/corpus/chunks/normalized-contacts/${files[index]}`;
    const node: KnowledgeNode = {
      ...base, id: `lead-${hubspotId}`, type: "source",
      label: naturalName(field(markdown, "Resolved Name") || field(markdown, "Raw Full Name") || field(markdown, "Raw Email")),
      description: describeLead(markdown),
      confidence: Number(field(markdown, "Classification").match(/Confidence: ([\d.]+)/)?.[1] ?? 0),
      tags: ["prospect", classification, field(markdown, "Raw Email"), field(markdown, "Reachability Tier")].filter(Boolean),
      sources: [{ sourceId: `dossier-${hubspotId}`, path: sourcePath, locator: `HubSpot contact ${hubspotId}`, excerpt: markdown }],
    };
    graph.nodes.push(node);
    graph.links.push({ id: `link-${node.id}`, source: groupId, target: node.id, type: "contains", strength: 0.7, verified: true, createdAt: generatedAt, updatedAt: generatedAt });
  }
  graph.activities.push({ id: `corpus-${signature}`, action: "imported", subjectId: "asp-invest", subjectLabel: "ASP Private Capital", actor: "Python lead corpus", timestamp: generatedAt, detail: `Loaded ${files.length} retained lead dossiers with source provenance.` });
  // Publish a new revision even when node and link counts are unchanged.
  graph.generatedAt = new Date(Math.max(Date.now(), cached ? Date.parse(cached.graph.generatedAt) + 1 : 0)).toISOString();
  cached = { signature, graph };
  return structuredClone(graph);
}
