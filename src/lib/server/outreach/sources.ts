import { hash, OutreachStore } from "./store";
import { MAX_SOURCE_AGE, sourceInput, type RegulatorySource, type SubscriberType, type ApplicabilityRecord, type RecipientJurisdiction } from "./types";

export const REQUIRED_SOURCES = ["fca-promotions", "uk-fsma21", "ico-email", "asp-policy"];
export const DELIVERABILITY_SOURCES = ["gmail-sender-guidelines", "yahoo-sender-guidelines", "microsoft-authentication", "rfc-8058"];
export const ALL_REGULATORY_SOURCES = [
  ...REQUIRED_SOURCES,
  ...DELIVERABILITY_SOURCES,
  "uk-fpo2005",
  "fca-perg8",
  "fca-cobs4",
  "fca-crypto",
  "ico-b2b",
  "asp-company-profile",
  "asp-activity-perimeter",
];

const officialHosts = new Set([
  "www.fca.org.uk",
  "handbook.fca.org.uk",
  "www.handbook.fca.org.uk",
  "register.fca.org.uk",
  "www.legislation.gov.uk",
  "ico.org.uk",
  "support.google.com",
  "senders.yahooinc.com",
  "learn.microsoft.com",
  "www.rfc-editor.org",
  "rfc-editor.org",
  "datatracker.ietf.org",
  "aspinvest.co.uk",
]);

export function approvedUrl(url: string, internal = false) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || !((internal && parsed.hostname === "aspinvest.co.uk") || officialHosts.has(parsed.hostname))) {
    throw new Error("Only registered official HTTPS source URLs are permitted");
  }
}

export function importSource(store: OutreachStore, input: unknown, fixture = false) {
  const value = sourceInput.parse(input);
  approvedUrl(value.url, value.kind === "asp-policy" || value.source_scope === "internal_company");
  const digest = hash(value.text);
  const previous = store.sourceList().find(s => s.id === value.id);
  const same = previous?.hash === digest && previous.url === value.url && previous.fixture === fixture && previous.kind === value.kind;
  const source: RegulatorySource = {
    ...value,
    hash: digest,
    retrievedAt: Date.now(),
    checkedAt: Date.now(),
    fixture,
    changed: !!previous && !same,
    approvedBy: same ? previous.approvedBy : undefined,
    approvedAt: same ? previous.approvedAt : undefined,
  };
  store.transaction(() => {
    store.saveSource(source);
    store.event("sources", "source_imported", { id: source.id, hash: digest, changed: source.changed, fixture });
  });
  return source;
}

export function approveSource(store: OutreachStore, id: string, digest: string, reviewer: string) {
  if (!reviewer.trim()) throw new Error("Named reviewer required");
  store.transaction(() => {
    const source = store.sourceList().find(s => s.id === id);
    if (!source || source.hash !== digest) throw new Error("Source version changed or missing");
    source.approvedBy = reviewer;
    source.approvedAt = Date.now();
    source.changed = false;
    store.saveSource(source);
    store.event("sources", "source_reviewed", { id, hash: digest, reviewer });
  });
}

export function usableSources(store: OutreachStore, mode: "fixture" | "live", now = Date.now()) {
  const sources = REQUIRED_SOURCES.map(id => store.sourceList().find(s => s.id === id));
  if (sources.some(s => !s || !s.approvedBy || s.changed || s.checkedAt > now + 60000 || now - s.checkedAt > MAX_SOURCE_AGE || (mode === "live" && s.fixture))) {
    throw new Error("COMPLIANCE_HOLD: missing, changed, unreviewed, stale or simulation-only regulatory/policy source");
  }
  return sources as RegulatorySource[];
}

export function usableDeliverabilitySources(store: OutreachStore, mode: "fixture" | "live", now = Date.now()) {
  const sources = DELIVERABILITY_SOURCES.map(id => store.sourceList().find(s => s.id === id));
  if (sources.some(s => !s || !s.approvedBy || s.changed || s.checkedAt > now + 60000 || now - s.checkedAt > MAX_SOURCE_AGE || (mode === "live" && s.fixture))) {
    throw new Error("COMPLIANCE_HOLD: missing, changed, unreviewed or simulation-only deliverability source");
  }
  return sources as RegulatorySource[];
}

export function fingerprint(sources: RegulatorySource[]) {
  return hash(sources.map(s => [s.id, s.hash, s.approvedAt]).sort());
}

export const APPLICABILITY_MATRIX: ApplicabilityRecord[] = [
  {
    entity: "ASP Consulting Partners Ltd",
    activity: "introducer_liaison",
    product: "none",
    recipientSubscriberType: "corporate",
    channel: "email",
    jurisdiction: "UK",
    effectiveFrom: "2024-01-01",
    allowed: true,
  },
  {
    entity: "ASP Consulting Partners Ltd",
    activity: "introducer_liaison",
    product: "none",
    recipientSubscriberType: "individual",
    channel: "email",
    jurisdiction: "UK",
    effectiveFrom: "2024-01-01",
    allowed: true,
  },
  {
    entity: "ASP Consulting Partners Ltd",
    activity: "introducer_liaison",
    product: "certain_bridge_loan_notes",
    recipientSubscriberType: "corporate",
    channel: "email",
    jurisdiction: "UK",
    effectiveFrom: "2024-01-01",
    allowed: true,
  },
  {
    entity: "ASP Consulting Partners Ltd",
    activity: "introducer_liaison",
    product: "certain_bridge_loan_notes",
    recipientSubscriberType: "individual",
    channel: "email",
    jurisdiction: "UK",
    effectiveFrom: "2024-01-01",
    allowed: true,
  },
  {
    entity: "ASP Consulting Partners Ltd",
    activity: "introducer_liaison",
    product: "aslan_crypto_fund",
    recipientSubscriberType: "corporate",
    channel: "email",
    jurisdiction: "UK",
    effectiveFrom: "2024-01-01",
    allowed: false,
    restrictionReason: "Managed crypto fund is legally unclassified; cannot equate fund units with direct qualifying cryptoassets under PS23/6. Qualified legal review required.",
  },
  {
    entity: "ASP Consulting Partners Ltd",
    activity: "introducer_liaison",
    product: "aslan_crypto_fund",
    recipientSubscriberType: "individual",
    channel: "email",
    jurisdiction: "UK",
    effectiveFrom: "2024-01-01",
    allowed: false,
    restrictionReason: "Managed crypto fund is legally unclassified; cannot equate fund units with direct qualifying cryptoassets under PS23/6. Qualified legal review required.",
  },
];

export function evaluateApplicability(
  entity: string,
  activity: string,
  product: string,
  recipientSubscriberType: SubscriberType,
  channel: "email",
  jurisdiction: RecipientJurisdiction | "UK" | "Global"
): { allowed: boolean; restrictionReason?: string } {
  void recipientSubscriberType;
  void channel;
  void jurisdiction;
  if (entity !== "ASP Consulting Partners Ltd") {
    return { allowed: false, restrictionReason: `Entity '${entity}' not authorised in ASP governance matrix.` };
  }
  if (activity !== "introducer_liaison") {
    return { allowed: false, restrictionReason: `Activity '${activity}' exceeds introducer/liaison permissions under FSMA s19.` };
  }
  if (product === "aslan_crypto_fund") {
    return { allowed: false, restrictionReason: "Managed crypto fund is legally unclassified; cannot equate fund units with direct qualifying cryptoassets under PS23/6. Qualified legal review required." };
  }
  return { allowed: true };
}

/** Daily scheduler fetches fixed registered URLs only. Changed content requires review. */
export async function refreshSources(store: OutreachStore, force = false) {
  for (const source of store.sourceList()) {
    if (source.fixture || source.kind === "asp-policy" || (!force && Date.now() - source.checkedAt < 86400000)) continue;
    try {
      approvedUrl(source.url);
      const response = await fetch(source.url, { redirect: "error", signal: AbortSignal.timeout(20000), headers: { Accept: "text/html,text/plain" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (Number(response.headers.get("content-length")) > 2000000) throw new Error("Source too large");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty source body");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 2000000) {
          await reader.cancel();
          throw new Error("Source too large");
        }
        chunks.push(part.value);
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      const text = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length < 100 || text.length > 100000) throw new Error("Source extraction needs manual review");
      importSource(store, {
        id: source.id,
        url: source.url,
        title: source.title,
        jurisdiction: source.jurisdiction,
        kind: source.kind,
        source_scope: source.source_scope,
        authority: source.authority,
        owner: source.owner,
        passage: source.passage,
        rule_status: source.rule_status,
        freshness_budget_days: source.freshness_budget_days,
        text,
        publishedAt: source.publishedAt,
        effectiveAt: source.effectiveAt,
      });
    } catch {
      store.event("sources", "source_refresh_failed", { id: source.id, message: "Source could not be refreshed; last verified timestamp retained" });
    }
  }
}

export function seedFixtureSources(store: OutreachStore) {
  const fixtures: Array<{
    id: string;
    url: string;
    kind: "legislation" | "guidance" | "asp-policy" | "deliverability";
    source_scope: "internal_company" | "external_regulatory";
    authority: string;
    owner: string;
    passage: string;
    rule_status: "current_rule" | "guidance" | "consultation" | "future_commencement";
    freshness_budget_days: number;
    text: string;
  }> = [
    {
      id: "fca-promotions",
      url: "https://www.fca.org.uk/firms/financial-promotions-and-adverts/approving-financial-promotions",
      kind: "guidance",
      source_scope: "external_regulatory",
      authority: "Financial Conduct Authority",
      owner: "Compliance Officer",
      passage: "FCA Financial Promotions Approval Rules & Regulatory Perimeter",
      rule_status: "current_rule",
      freshness_budget_days: 7,
      text: "SIMULATION RULE: A financial promotion requires an established lawful basis. Automated review is not statutory approval; do not imply advice or suitability.",
    },
    {
      id: "uk-fsma21",
      url: "https://www.legislation.gov.uk/ukpga/2000/8/section/21",
      kind: "legislation",
      source_scope: "external_regulatory",
      authority: "UK Parliament",
      owner: "Compliance Officer",
      passage: "Financial Services and Markets Act 2000 Section 21(1)",
      rule_status: "current_rule",
      freshness_budget_days: 7,
      text: "SIMULATION RULE: Investor interest does not establish an exemption or permission to communicate a financial promotion. Escalate uncertain applicability.",
    },
    {
      id: "ico-email",
      url: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/",
      kind: "guidance",
      source_scope: "external_regulatory",
      authority: "Information Commissioner's Office",
      owner: "Compliance Officer",
      passage: "PECR Regulation 22 & Direct Marketing by Electronic Mail",
      rule_status: "guidance",
      freshness_budget_days: 14,
      text: "SIMULATION RULE: Use documented communication permission and honour opt-outs. Unknown permission cannot be inferred from historical email validation.",
    },
    {
      id: "asp-policy",
      url: "https://aspinvest.co.uk/investment-policy",
      kind: "asp-policy",
      source_scope: "internal_company",
      authority: "ASP Consulting Partners Ltd Board",
      owner: "Head of Operations",
      passage: "ASP Introducer Perimeter & Investor Communications Policy v2.1",
      rule_status: "current_rule",
      freshness_budget_days: 30,
      text: "SIMULATION POLICY: The opportunities themselves are not disclosed until consultation. The purpose of this agent outreach framework is to gather interest into ASP Private Capital as private market liaisons. Specific opportunities are never disclosed until a real person is on a call or in a meeting with ASP. The furthest outreach can go regarding opportunities is relaying general macroeconomic information regarding the various sectors which ASP operate in: managed funds, private equity and precious metals. No investment advice, suitability recommendations or return guarantees.",
    },
    {
      id: "gmail-sender-guidelines",
      url: "https://support.google.com/a/answer/81126",
      kind: "deliverability",
      source_scope: "external_regulatory",
      authority: "Google Workspace Postmaster",
      owner: "Technical Lead",
      passage: "Google Email Sender Guidelines (Authentication, Spam Rate, Unsubscribe)",
      rule_status: "guidance",
      freshness_budget_days: 30,
      text: "SIMULATION SOURCE: Gmail sender guidance covers SPF or DKIM, DNS, TLS, RFC 5322 formatting, spam-rate monitoring, DMARC alignment and one-click unsubscribe for applicable bulk messages.",
    },
    {
      id: "yahoo-sender-guidelines",
      url: "https://senders.yahooinc.com/best-practices/",
      kind: "deliverability",
      source_scope: "external_regulatory",
      authority: "Yahoo Postmaster Team",
      owner: "Technical Lead",
      passage: "Yahoo Sender Best Practices 2024",
      rule_status: "guidance",
      freshness_budget_days: 30,
      text: "SIMULATION SOURCE: Yahoo sender guidance covers authentication, low complaint rates, forward and reverse DNS, RFC compliance, unsubscribe handling and sender reputation.",
    },
    {
      id: "microsoft-authentication",
      url: "https://learn.microsoft.com/en-us/defender-office-365/email-authentication-about",
      kind: "deliverability",
      source_scope: "external_regulatory",
      authority: "Microsoft Security Documentation",
      owner: "Technical Lead",
      passage: "Microsoft Defender for Office 365 Email Authentication",
      rule_status: "guidance",
      freshness_budget_days: 30,
      text: "SIMULATION SOURCE: Microsoft documentation describes SPF, DKIM, DMARC and ARC as interdependent email-authentication controls for sender identity and message integrity.",
    },
    {
      id: "rfc-8058",
      url: "https://www.rfc-editor.org/rfc/rfc8058",
      kind: "deliverability",
      source_scope: "external_regulatory",
      authority: "Internet Engineering Task Force (IETF)",
      owner: "Technical Lead",
      passage: "RFC 8058 Signalling One-Click Functionality for List-Unsubscribe Header",
      rule_status: "current_rule",
      freshness_budget_days: 180,
      text: "SIMULATION SOURCE: RFC 8058 defines the one-click List-Unsubscribe mechanism for applicable list email messages.",
    },
    {
      id: "uk-fpo2005",
      url: "https://www.legislation.gov.uk/uksi/2005/1529/contents",
      kind: "legislation",
      source_scope: "external_regulatory",
      authority: "UK Parliament",
      owner: "Compliance Officer",
      passage: "Financial Services and Markets Act 2000 (Financial Promotion) Order 2005 Articles 48, 50",
      rule_status: "current_rule",
      freshness_budget_days: 14,
      text: "SIMULATION RULE: FSMA 2000 (Financial Promotion) Order 2005 Art 48 (High Net Worth) and Art 50 (Sophisticated Investors) require signed investor statements. B2B or wealth labels alone are not statutory exemptions.",
    },
    {
      id: "fca-perg8",
      url: "https://handbook.fca.org.uk/handbook/perg8",
      kind: "guidance",
      source_scope: "external_regulatory",
      authority: "Financial Conduct Authority",
      owner: "Compliance Officer",
      passage: "FCA PERG 8 Financial Promotion Perimeter Guidance",
      rule_status: "guidance",
      freshness_budget_days: 14,
      text: "SIMULATION GUIDANCE: PERG 8 guidance on invitations and inducements. Communications having the purpose or effect of bringing about an investment transaction are subject to section 21.",
    },
    {
      id: "fca-cobs4",
      url: "https://handbook.fca.org.uk/handbook/COBS/4/",
      kind: "guidance",
      source_scope: "external_regulatory",
      authority: "Financial Conduct Authority",
      owner: "Compliance Officer",
      passage: "FCA Conduct of Business Sourcebook 4 (COBS 4) Communicating with Clients",
      rule_status: "current_rule",
      freshness_budget_days: 14,
      text: "SIMULATION RULE: COBS 4 rules: promotions must be fair, clear and not misleading. Risk warnings must be prominent and past performance is not a reliable indicator.",
    },
    {
      id: "fca-crypto",
      url: "https://www.fca.org.uk/publications/fg23-3-finalised-non-handbook-guidance-cryptoasset-financial-promotions",
      kind: "guidance",
      source_scope: "external_regulatory",
      authority: "Financial Conduct Authority",
      owner: "Compliance Officer",
      passage: "FCA FG23/3 Finalised Non-Handbook Guidance on Cryptoasset Financial Promotions",
      rule_status: "guidance",
      freshness_budget_days: 14,
      text: "SIMULATION GUIDANCE: FG23/3 rules on qualifying cryptoassets. Managed crypto fund units are collective investment schemes; they do not automatically qualify under the crypto promotion regime without formal classification.",
    },
    {
      id: "ico-b2b",
      url: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/",
      kind: "guidance",
      source_scope: "external_regulatory",
      authority: "Information Commissioner's Office",
      owner: "Compliance Officer",
      passage: "ICO Guidance on Business-to-Business Marketing under PECR and UK GDPR",
      rule_status: "guidance",
      freshness_budget_days: 14,
      text: "SIMULATION GUIDANCE: Corporate subscribers (companies, LLPs) may be sent marketing emails if relevant to their work, provided clear opt-out is offered. Individual sole traders and partnerships require opt-in consent.",
    },
    {
      id: "asp-company-profile",
      url: "https://aspinvest.co.uk/company-profile",
      kind: "asp-policy",
      source_scope: "internal_company",
      authority: "Companies House / ASP Consulting Partners Ltd",
      owner: "Director",
      passage: "ASP Consulting Partners Ltd (Company No. 09641362) Statutory Profile",
      rule_status: "current_rule",
      freshness_budget_days: 90,
      text: "SIMULATION PROFILE: ASP Private Capital is the trading name of ASP Consulting Partners Ltd, CRN 09641362. Acts as introducer and liaison; not an authorised firm under FSMA s19.",
    },
    {
      id: "asp-activity-perimeter",
      url: "https://aspinvest.co.uk/activity-perimeter",
      kind: "asp-policy",
      source_scope: "internal_company",
      authority: "ASP Compliance",
      owner: "Compliance Officer",
      passage: "ASP Approved Activity and Promotion Matrix v1.0",
      rule_status: "current_rule",
      freshness_budget_days: 30,
      text: "SIMULATION MATRIX: Approved activity is capital introducer and private market liaison. Specific opportunities are never disclosed until consultation with an ASP representative. Outreach is restricted to general macroeconomic information in managed funds, private equity, and precious metals. Prohibited: disclosing specific deals or investment opportunities, promoting unclassified crypto funds, investment advice, custody.",
    },
  ];

  for (const item of fixtures) {
    const existing = store.sourceList().find(s => s.id === item.id);
    if (!existing) {
      const s = importSource(store, { ...item, title: item.id, jurisdiction: "UK" }, true);
      approveSource(store, s.id, s.hash, "simulation-fixture");
    } else if (!existing.approvedBy) {
      approveSource(store, existing.id, existing.hash, "simulation-fixture");
    }
  }
}
