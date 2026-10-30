export interface DossierField {
  label: string;
  value: string;
  href?: string;
}

export interface DossierSection {
  title: string;
  fields: DossierField[];
}

export interface LeadDossier {
  validationSummary: string;
  highlights: DossierField[];
  sections: DossierSection[];
}

const acronyms: Record<string, string> = {
  b2b: "B2B",
  b2c: "B2C",
  dns: "DNS",
  mx: "MX",
  smtp: "SMTP",
  crm: "CRM",
  e164: "E.164",
  id: "ID",
  api: "API",
};

function sentenceCase(value: string) {
  const cleaned = value.replaceAll("_", " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (!cleaned) return "Not recorded";
  const words = cleaned.split(" ").map((word) => acronyms[word] ?? word);
  return `${words.join(" ").charAt(0).toUpperCase()}${words.join(" ").slice(1)}`;
}

export function naturalName(value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  const letters = trimmed.replace(/[^a-z]/gi, "");
  if (!letters || letters !== letters.toUpperCase()) return trimmed;
  return trimmed.toLowerCase().replace(/(^|[\s&/'-])([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

export function humanizeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(humanizeValue).join("; ");
  if (typeof value !== "string") return String(value);
  const trimmed = value.trim().replace(/^`|`$/g, "");
  const fixedLabels: Record<string, string> = {
    DUAL_CHANNEL_REACHABLE: "Dual-channel reachable",
    EMAIL_ONLY_REACHABLE: "Email-only reachable",
    PHONE_ONLY_REACHABLE: "Phone-only reachable",
  };
  if (fixedLabels[trimmed]) return fixedLabels[trimmed];
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const date = new Date(trimmed);
    if (!Number.isNaN(date.valueOf())) return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00Z`);
    if (!Number.isNaN(date.valueOf())) return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(date);
  }
  if (trimmed === "True" || trimmed === "true") return "Yes";
  if (trimmed === "False" || trimmed === "false") return "No";
  if (/^\[.*\]$/.test(trimmed)) {
    try { return (JSON.parse(trimmed) as unknown[]).map((item) => humanizeValue(item)).join("; "); } catch { /* retain source text */ }
  }
  const evidence = trimmed.match(/^([a-z_]+):(.*)$/);
  if (evidence) return `${sentenceCase(evidence[1])}: ${evidence[2]}`;
  const classification = trimmed.match(/^([A-Z0-9_]+) \(Confidence: ([\d.]+)\)$/);
  if (classification) return `${sentenceCase(classification[1])} (${Math.round(Number(classification[2]) * 100)}% confidence)`;
  const validation = trimmed.match(/^([A-Z_]+) \(([A-Z0-9_]+)\)$/);
  if (validation) return `${sentenceCase(validation[1])} (${sentenceCase(validation[2]).toLowerCase()})`;
  if (/^[A-Z0-9_]+$/.test(trimmed)) return sentenceCase(trimmed);
  if (/^[a-z0-9.-]+(?:_[a-z0-9.-]+)+$/.test(trimmed)) return sentenceCase(trimmed);
  return trimmed.replace(/\b([A-Z][A-Z0-9_]+_[A-Z0-9_]+)\b/g, (token) => sentenceCase(token).toLowerCase());
}

export function mailboxResultPhrase(value: unknown) {
  const label = humanizeValue(value);
  const phrases: Record<string, string> = {
    Deliverable: "a deliverable result",
    "SMTP connection timeout": "an SMTP connection timeout",
    "SMTP policy blocked": "an SMTP policy block",
    "Mailbox not found": "a mailbox-not-found result",
    "Cannot verify": "an inconclusive result",
    "SMTP unverifiable": "an unverifiable SMTP result",
  };
  return phrases[label] ?? label.toLowerCase();
}

function parseLines(markdown: string) {
  const values = new Map<string, string>();
  for (const line of markdown.split("\n")) {
    const header = line.match(/^# ([^:]+): `([^`]*)`$/);
    if (header) values.set(header[1], header[2]);
    const bullet = line.match(/^- \*\*([^:]+):\*\* (.*)$/);
    if (bullet) values.set(bullet[1], bullet[2]);
  }
  return values;
}

function parseJsonBlocks(markdown: string) {
  const blocks = [...markdown.matchAll(/```json\s*([\s\S]*?)```/g)].map((match) => {
    try { return JSON.parse(match[1]) as unknown; } catch { return null; }
  });
  const events = Array.isArray(blocks[0]) ? blocks[0] as Array<Record<string, unknown>> : [];
  const raw = blocks.find((block) => block && !Array.isArray(block)) as Record<string, unknown> | undefined;
  return { events, raw: raw ?? {} };
}

const row = (label: string, value: unknown, href?: string): DossierField => ({
  label,
  value: humanizeValue(value),
  ...(href ? { href } : {}),
});

export function parseLeadDossier(markdown: string, sourcePath: string): LeadDossier {
  const values = parseLines(markdown);
  const { events, raw } = parseJsonBlocks(markdown);
  const get = (key: string, rawKey?: string) => values.get(key) ?? (rawKey ? raw[rawKey] : undefined);
  const reachability = humanizeValue(get("Reachability Tier"));
  const reachabilityPhrase = reachability === "Dual channel reachable"
    ? "both email and phone recorded as reachable"
    : reachability === "Email only reachable"
      ? "email recorded as the only reachable channel"
      : reachability.toLowerCase();
  const phoneStatus = get("Phone Diallable") === "True"
    ? `a ${humanizeValue(get("Phone Line Type")).toLowerCase()} number recorded as diallable`
    : "Not recorded as diallable";
  const confidence = String(get("Classification") ?? "").match(/Confidence: ([\d.]+)/)?.[1];
  const hubspotUrl = String(get("HubSpot URL", "hubspot_record_url") ?? "");
  const evidence = humanizeValue(get("Classification Evidence"));

  const eventSections = events.map((event, index): DossierSection => ({
    title: `Validation event ${index + 1}`,
    fields: [
      row("Event", event.event_type),
      row("Recorded at", event.timestamp),
      row("Recorded by", event.agent),
      row("Channel result", event.channel_tier),
      row("Email result", event.email_status),
      row("Phone result", event.phone_status),
    ],
  }));

  return {
    validationSummary: `This prospect is retained in the email-optimised cohort, with ${reachabilityPhrase}. Email verification returned ${mailboxResultPhrase(get("Mailbox SMTP Status"))}, and the phone is ${phoneStatus.toLowerCase()}. These checks describe the recorded contact channels; they do not confirm investor qualification or permission for outreach.`,
    highlights: [
      row("Validation status", get("Validation Status")),
      row("Reachability", get("Reachability Tier")),
      row("Classification confidence", confidence ? `${Math.round(Number(confidence) * 100)}%` : undefined),
    ],
    sections: [
      {
        title: "Contact and CRM record",
        fields: [
          row("Full name", naturalName(String(get("Resolved Name", "raw_full_name") ?? ""))),
          row("First name", naturalName(String(raw.raw_first_name ?? ""))),
          row("Last name", naturalName(String(raw.raw_last_name ?? ""))),
          row("Contact email", get("Raw Email", "raw_email")),
          row("Raw phone number", get("Raw Phone", "raw_phone")),
          row("Primary company", raw.primary_company),
          row("Created", get("Create Date", "create_date")),
          row("HubSpot ID", get("HubSpot Record ID", "hubspot_record_id")),
          row("HubSpot record", hubspotUrl ? "Open contact in HubSpot" : undefined, hubspotUrl || undefined),
        ],
      },
      {
        title: "Email validation",
        fields: [
          row("Mail routing", get("DNS MX Status")),
          row("Mail provider", get("Mail Provider")),
          row("Mailbox result", get("Mailbox SMTP Status")),
          row("Catch-all domain", get("Catch-All Domain")),
        ],
      },
      {
        title: "Phone validation",
        fields: [
          row("Normalized phone number", get("Phone E.164")),
          row("Phone type", get("Phone Line Type")),
          row("Landline", get("Is Landline")),
          row("Diallable", get("Phone Diallable")),
          row("Shared phone record", get("Shared Phone Linkage")),
        ],
      },
      {
        title: "Classification and context",
        fields: [
          row("Source segment", get("Segment")),
          row("Classification", get("Classification")),
          row("Classification evidence", evidence),
          row("Investor-fit hypothesis", get("Investor Fit Hypothesis")),
          row("Historical outreach-ready flag", get("Phase 2 Outreach Ready")),
        ],
      },
      {
        title: "Source and provenance",
        fields: [
          row("Source record", "Derived contact context dataset"),
          row("Source fingerprint", get("Source SHA-256")),
          row("Dossier file", sourcePath ? "Validated Markdown contact dossier" : undefined),
        ],
      },
      ...eventSections,
    ],
  };
}
