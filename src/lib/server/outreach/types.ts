import { z } from "zod";

export const AGENTS = ["prospect", "outreach", "conversation", "deliverability", "compliance"] as const;
export type Agent = typeof AGENTS[number];

export type SubscriberType = "corporate" | "individual";
export type LawfulBasis = "consent" | "legitimate_interests" | "contract" | "unknown";
export type PecrCondition = "consent" | "soft_opt_in_pecr_22_3" | "corporate_subscriber_pecr_22" | "none" | "unknown";
export type RecipientJurisdiction = "UK" | "EU" | "US" | "Other";

export interface ContactPermissionGateResult {
  decision: "pass" | "hold" | "block";
  reason: string;
  subscriberType: SubscriberType;
  lawfulBasis: LawfulBasis;
  pecrCondition: PecrCondition;
  evaluatedAt: number;
}

export type FinancialInstrumentCategory = "unspecified" | "loan_note" | "collective_investment_scheme" | "cryptoasset" | "unregulated_commercial";
export type PromotionRoute = "exempt_fpo_art48_hnw" | "exempt_fpo_art50_sophisticated" | "fca_authorised_approver" | "non_promotional_factual" | "unclear_requires_review";

export const APPROVED_OPERATING_SECTORS = ["managed_funds", "private_equity", "precious_metals"] as const;
export type ApprovedOperatingSector = typeof APPROVED_OPERATING_SECTORS[number];

export interface FinancialPromotionGateResult {
  isInvitationOrInducement: boolean;
  instrumentCategory: FinancialInstrumentCategory;
  promotionRoute: PromotionRoute;
  specificOpportunitiesDisclosed: boolean;
  decision: "pass" | "hold" | "block" | "escalate";
  reason: string;
  requiresQualifiedReview: boolean;
  evaluatedAt: number;
}

export interface ApplicabilityRecord {
  entity: string;
  activity: string;
  product: string;
  recipientSubscriberType: SubscriberType;
  channel: "email";
  jurisdiction: "UK" | "Global";
  effectiveFrom: string;
  effectiveTo?: string;
  allowed: boolean;
  restrictionReason?: string;
}

export type NamedEscalationQueue = "legal_team" | "compliance_officer" | "broker_dylan" | "general_support" | "human_operator";

export const syntheticProspect = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  email: z.string().email().refine(value => value.endsWith("@example.test"), "Synthetic @example.test addresses only"),
  permission: z.enum(["granted", "unknown", "denied"]),
  facts: z.array(z.object({ text: z.string().max(1500), source: z.string().max(150) })).max(20),
  subscriberType: z.enum(["corporate", "individual"]).optional().default("individual"),
  jurisdiction: z.enum(["UK", "EU", "US", "Other"]).optional().default("UK"),
  lawfulBasis: z.enum(["consent", "legitimate_interests", "contract", "unknown"]).optional().default("consent"),
  pecrCondition: z.enum(["consent", "soft_opt_in_pecr_22_3", "corporate_subscriber_pecr_22", "none", "unknown"]).optional().default("consent"),
  phase1LeadId: z.string().optional(),
  phase1Validated: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
}).strict();
export type Prospect = z.infer<typeof syntheticProspect> & { dossier?: string };

export const sandboxProspect = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  permission: z.enum(["granted", "unknown", "denied"]),
  facts: z.array(z.object({ text: z.string().max(4000), source: z.string().max(300) })).max(100),
  dossier: z.string().min(1).max(250000),
  subscriberType: z.enum(["corporate", "individual"]).optional().default("individual"),
  jurisdiction: z.enum(["UK", "EU", "US", "Other"]).optional().default("UK"),
  lawfulBasis: z.enum(["consent", "legitimate_interests", "contract", "unknown"]).optional().default("consent"),
  pecrCondition: z.enum(["consent", "soft_opt_in_pecr_22_3", "corporate_subscriber_pecr_22", "none", "unknown"]).optional().default("consent"),
  phase1LeadId: z.string().optional(),
  phase1Validated: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
}).strict();
export type SandboxProspect = z.infer<typeof sandboxProspect>;

export type Stage = "prospect" | "outreach" | "conversation" | "deliverability" | "compliance" | "dispatch";
export type Status = "queued" | "running" | "awaiting_approval" | "waiting_reply" | "booking_pending" | "booked" | "held" | "escalated" | "suppressed" | "paused" | "failed";
export type Draft = { version: number; subject: string; body: string; hash: string };
export type Citation = { sourceId: string; hash: string; quote: string };
export type Review = { decision: "pass" | "revise" | "block" | "escalate"; summary: string; citations: Citation[]; draftHash: string; sourceFingerprint: string; reviewedAt: number };
export type DeliverabilityReview = { decision: "pass" | "revise" | "block" | "escalate"; summary: string; checks: { id: string; status: "pass" | "warn" | "fail"; detail: string }[]; citations: Citation[]; draftHash: string; sourceFingerprint: string; reviewedAt: number };

export interface Run {
  id: string;
  campaign: "relationship-reactivation";
  campaignId?: string;
  prospect: Prospect | SandboxProspect;
  sandbox: boolean;
  mode: "human" | "automatic";
  inference: "fixture" | "live";
  synthetic: boolean;
  revision: number;
  status: Status;
  next: Stage;
  brief?: { summary: string; sources: string[] };
  draft?: Draft;
  review?: Review;
  deliverability?: DeliverabilityReview;
  contactPermission?: ContactPermissionGateResult;
  promotionReview?: FinancialPromotionGateResult;
  escalationQueue?: NamedEscalationQueue;
  approval?: { actor: string; draftHash: string };
  transcript: {
    direction: "inbound" | "outbound";
    text: string;
    eventId: string;
    origin?: "autonomous_agent" | "inbound_prospect" | "manual_human_operator";
    from?: string;
    fromName?: string;
    to?: string;
    subject?: string;
    sentAt?: string;
    externalMessageId?: string;
    deliveryStatus?: "simulated" | "queued" | "sent";
    tags?: string[];
  }[];
  classification?: string;
  callback?: {dueAt:string|null;status:string;channel:string};
  intent: "initial" | "reply" | "followup";
  corrections: number;
  draftCounter: number;
  followups: number;
  booking?: { id: string; startsAt: string; status: "confirmed" | "cancelled"; sequence: number };
  issue?: string;
  tags?: string[];
  humanManaged?: boolean;
  createdAt: number;
}

export interface RegulatorySource {
  id: string;
  url: string;
  title: string;
  jurisdiction: "UK" | "Global";
  kind: "legislation" | "guidance" | "asp-policy" | "deliverability";
  source_scope?: "internal_company" | "external_regulatory";
  authority?: string;
  owner?: string;
  passage?: string;
  rule_status?: "current_rule" | "guidance" | "consultation" | "future_commencement";
  freshness_budget_days?: number;
  text: string;
  hash: string;
  retrievedAt: number;
  publishedAt?: string;
  effectiveAt?: string;
  checkedAt: number;
  approvedBy?: string;
  approvedAt?: number;
  changed: boolean;
  fixture: boolean;
}

export const sourceInput = z.object({
  id: z.string().min(1).max(80),
  url: z.string().url(),
  title: z.string().min(1).max(200),
  jurisdiction: z.enum(["UK", "Global"]),
  kind: z.enum(["legislation", "guidance", "asp-policy", "deliverability"]),
  source_scope: z.enum(["internal_company", "external_regulatory"]).optional(),
  authority: z.string().max(100).optional(),
  owner: z.string().max(100).optional(),
  passage: z.string().max(500).optional(),
  rule_status: z.enum(["current_rule", "guidance", "consultation", "future_commencement"]).optional(),
  freshness_budget_days: z.number().int().positive().optional(),
  text: z.string().min(30).max(100000),
  publishedAt: z.string().optional(),
  effectiveAt: z.string().optional(),
}).strict();

export const responseSchemas = {
  prospect: z.object({ summary: z.string().min(1).max(4000), sources: z.array(z.string()).min(1) }).strict(),
  outreach: z.object({ subject: z.string().min(1).max(160), body: z.string().min(1).max(8000) }).strict(),
  conversation: z.object({
    classification: z.enum([
      "opt_out",
      "legal_threat",
      "complaint",
      "advice",
      "unclear",
      "booking",
      "question",
      "interested",
      "not_interested",
      "out_of_office",
    ]),
    assessment:z.object({intents:z.array(z.string()).max(12),questions:z.array(z.string()).max(12),objections:z.array(z.string()).max(12),evidence:z.array(z.string()).max(12),sentiment:z.string().max(100),clarification:z.string().max(500).optional(),scheduling:z.object({delegated:z.boolean(),quote:z.string().max(2000),timeZone:z.string().max(100),after:z.string().datetime({offset:true}).nullable(),before:z.string().datetime({offset:true}).nullable(),localStartMinute:z.number().int().min(0).max(1439),localEndMinute:z.number().int().min(1).max(1440)}).optional(),callback:z.object({requested:z.boolean(),originalText:z.string().max(2000),dueAt:z.string().datetime({offset:true}).nullable(),channel:z.enum(["email","phone","unspecified"])}).optional()}).strict().optional(),
    summary: z.string().max(2000),
    escalationQueue: z.enum(["legal_team", "compliance_officer", "broker_dylan", "general_support"]).optional(),
  }).strict(),
  compliance: z.object({ decision: z.enum(["pass", "revise", "block", "escalate"]), summary: z.string().min(1).max(4000), citations: z.array(z.object({ sourceId: z.string(), hash: z.string(), quote: z.string().min(10).max(1500) }).strict()).min(1) }).strict(),
  deliverability: z.object({ decision: z.enum(["pass", "revise", "block", "escalate"]), summary: z.string().min(1).max(4000), checks: z.array(z.object({ id: z.string(), status: z.enum(["pass", "warn", "fail"]), detail: z.string() }).strict()).min(1), citations: z.array(z.object({ sourceId: z.string(), hash: z.string(), quote: z.string().min(10).max(1500) }).strict()).min(1) }).strict(),
};

export interface ModelAdapter {
  mode: "fixture" | "live";
  invoke(agent: Agent, context: Record<string, unknown>): Promise<unknown>;
}

export const BOOKING_URL = "https://cal.com/asp-private-capital/opportunities";
export const SENDER = "dylan@aspinvest.co.uk";
export const MAX_SOURCE_AGE = 7 * 24 * 60 * 60 * 1000;
