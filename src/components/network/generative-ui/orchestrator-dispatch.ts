// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {
  GenerativeWidgetPayload,
  LeadQualificationData,
  ComplianceGateData,
  ArchitectureDiffData,
  NeuralSubGraphData,
  FleetTraceData,
} from './types';

export const SAMPLE_LEAD_DOSSIER: LeadQualificationData = {
  leadId: 'lead-alistair-crawford',
  name: 'Alistair Crawford',
  role: 'Managing Partner',
  firm: 'Meridian Wealth Management',
  location: 'Mayfair, London, UK',
  aum: '£142M AUM',
  classification: 'Certified HNW Investor (Art. 48 FPO)',
  confidenceScore: 94,
  statutoryBasis: 'FSMA 2000 (Financial Promotion) Order 2005 Article 48',
  notes:
    'Verified net annual income > £100,000 and net investable assets > £250,000 excluding primary residence. Active private equity and syndicate allocator.',
  targetNodeId: 'node-lead-1',
  citations: [
    {
      id: 'cite-fca',
      title: 'FCA Mutuals Public Register',
      source: 'FRN: 948211 • Authorised Representative',
      verified: true,
    },
    {
      id: 'cite-ch',
      title: 'Companies House UK Filing',
      source: 'Company #08849120 • Meridian Wealth Mgmt LLP',
      verified: true,
    },
    {
      id: 'cite-li',
      title: 'Executive Verified Dossier',
      source: 'Angel Syndicate Lead & Founder',
      verified: true,
    },
  ],
};

export const SAMPLE_COMPLIANCE_GATE: ComplianceGateData = {
  auditId: 'audit-9921-fsma',
  targetEntity: 'Meridian Wealth Management • Alistair Crawford',
  evaluatedAt: new Date().toISOString(),
  overallStatus: 'passed',
  statutoryHash: 'a7c93e4b8f0291df130a4421b93f77ea6102dc8519472e391b489aef771036c2',
  checks: [
    {
      id: 'chk-fsma',
      regulation: 'FSMA 2000 Section 21',
      statutoryArticle: 'Financial Promotion Restriction - Art 48 Exemption',
      status: 'passed',
      detail:
        'Certified High Net Worth individual exemption verified; mandatory risk warning codified in outreach footer.',
      fingerprint: '3f88b192a0e41299dfb8c2',
    },
    {
      id: 'chk-pecr',
      regulation: 'PECR 2003 Regulation 22',
      statutoryArticle: 'B2B Electronic Direct Marketing',
      status: 'passed',
      detail:
        'Corporate subscriber identity confirmed; clear opt-out mechanism and identity attribution embedded.',
      fingerprint: '9c44e81a337bd0012e557b',
    },
    {
      id: 'chk-ps23',
      regulation: 'FCA PS23/6 Safeguard',
      statutoryArticle: 'Anti-Greenwashing & High-Risk Investments',
      status: 'passed',
      detail:
        'No unsubstantiated sustainability claims present; clear capital-at-risk disclaimer appended.',
      fingerprint: '1b22ff78923ca6e00195ad',
    },
  ],
};

export const SAMPLE_ARCHITECTURE_DIFF: ArchitectureDiffData = {
  fileId: 'agents/runtime/engine.ts',
  filePath: 'src/lib/server/outreach/engine.ts',
  language: 'typescript',
  summary:
    'Integrate pre-flight statutory gate verification before initiating automated outreach sequencing.',
  targetCommitHash: 'd74a9c8019b882',
  diffLines: [
    { type: 'context', content: 'export async function dispatchOutreach(runId: string) {', lineNumber: 142 },
    { type: 'context', content: '  const run = outreachStore().get(runId);', lineNumber: 143 },
    { type: 'removed', content: '  // Direct dispatch without statutory check', lineNumber: 144 },
    { type: 'added', content: '  // Pre-flight statutory compliance validation', lineNumber: 144 },
    { type: 'added', content: '  const complianceResult = await evaluateStatutoryGate(run.prospect);', lineNumber: 145 },
    { type: 'added', content: '  if (complianceResult.overallStatus !== "passed") {', lineNumber: 146 },
    { type: 'added', content: '    return outreachStore().holdRun(runId, complianceResult.auditId);', lineNumber: 147 },
    { type: 'added', content: '  }', lineNumber: 148 },
    { type: 'context', content: '  return outreachWorker.enqueue(runId);', lineNumber: 149 },
  ],
};

export const SAMPLE_SUBGRAPH: NeuralSubGraphData = {
  query: 'Investor Entity Traversal • Meridian Wealth Syndicate',
  rootNodeId: 'node-lead-1',
  summary:
    'Multi-hop retrieval traversed 4 interconnected nodes across investor credentials, corporate filings, and regulatory perimeter.',
  nodes: [
    { id: 'node-lead-1', label: 'Alistair Crawford', type: 'lead', confidence: 0.96 },
    { id: 'org-meridian', label: 'Meridian Wealth', type: 'organization', confidence: 0.94 },
    { id: 'reg-fsma2000', label: 'FSMA 2000 Art 48', type: 'regulation', confidence: 0.99 },
    { id: 'deal-angel', label: 'Angel Syndicate UK', type: 'portfolio', confidence: 0.88 },
  ],
  edges: [
    { from: 'node-lead-1', to: 'org-meridian', relation: 'Managing Partner' },
    { from: 'node-lead-1', to: 'deal-angel', relation: 'Syndicate Lead' },
    { from: 'org-meridian', to: 'reg-fsma2000', relation: 'Governed Under' },
  ],
};

export const SAMPLE_FLEET_TRACE: FleetTraceData = {
  dispatchId: 'disp-8839210-sovereign',
  trigger: 'Natural Language Mission Control Prompt',
  totalLatencyMs: 631,
  steps: [
    {
      agentId: 'prospect',
      agentName: 'Prospect Intelligence',
      role: 'Llama-3.1-8B-Instruct',
      status: 'completed',
      latencyMs: 184,
      summary: 'Aggregated verified filings, FCA FRN: 948211, and net asset metrics.',
    },
    {
      agentId: 'compliance',
      agentName: 'Compliance Gatekeeper',
      role: 'Statutory Evaluator',
      status: 'completed',
      latencyMs: 92,
      summary: 'Verified Article 48 FPO exemption and verified PECR B2B rules.',
    },
    {
      agentId: 'outreach',
      agentName: 'Outreach Liaison',
      role: 'Bespoke Communicator',
      status: 'completed',
      latencyMs: 310,
      summary: 'Generated tailored value proposition focusing on ASP Private Capital co-investment.',
    },
    {
      agentId: 'router',
      agentName: 'Conversation Router',
      role: 'Direct Escalator',
      status: 'completed',
      latencyMs: 45,
      summary: 'Configured partner-level notification channel upon lead reply.',
    },
  ],
};

/**
 * Project-agnostic orchestrator intent classifier and generative response builder.
 */
export function dispatchOrchestratorIntent(prompt: string): {
  narrative: string;
  widgets: GenerativeWidgetPayload[];
} {
  const q = prompt.toLowerCase();

  if (q.includes('compliance') || q.includes('regulat') || q.includes('fsma') || q.includes('pecr') || q.includes('gate')) {
    return {
      narrative:
        'I evaluated statutory perimeters against the active knowledge corpus and FSMA 2000 Section 21 / PECR 2003 guidelines. The proposed engagement qualifies under the Article 48 Certified High Net Worth Investor exemption with all mandatory disclosures codified.',
      widgets: [
        { type: 'compliance-gate', data: SAMPLE_COMPLIANCE_GATE },
        { type: 'fleet-trace', data: SAMPLE_FLEET_TRACE },
      ],
    };
  }

  if (q.includes('code') || q.includes('diff') || q.includes('architect') || q.includes('debug') || q.includes('engine') || q.includes('ide')) {
    return {
      narrative:
        'I have drafted an architectural patch in `src/lib/server/outreach/engine.ts` to enforce runtime pre-flight statutory gate verification before enqueuing any outreach task. You can inspect the unified diff below or launch the Full IDE Overlay workspace.',
      widgets: [
        { type: 'architecture-diff', data: SAMPLE_ARCHITECTURE_DIFF },
      ],
    };
  }

  if (q.includes('graph') || q.includes('network') || q.includes('subgraph') || q.includes('relation') || q.includes('vector')) {
    return {
      narrative:
        'Here is the traversed sub-graph showing how Alistair Crawford connects to Meridian Wealth, verified corporate filings, and the governing regulatory frameworks.',
      widgets: [
        { type: 'neural-subgraph', data: SAMPLE_SUBGRAPH },
      ],
    };
  }

  if (q.includes('trace') || q.includes('fleet') || q.includes('agent') || q.includes('sovereign')) {
    return {
      narrative:
        'The sovereign agent fleet executed asynchronously across 4 fine-tuned checkpoints in 631ms with complete telemetry:',
      widgets: [
        { type: 'fleet-trace', data: SAMPLE_FLEET_TRACE },
      ],
    };
  }

  // Default: Comprehensive lead qualification with compliance gate and sovereign execution trace
  return {
    narrative:
      `I investigated your request across the Knowledge Bank and coordinated with the Sovereign Agent Fleet. Here is the verified qualification dossier for **${SAMPLE_LEAD_DOSSIER.name}** (${SAMPLE_LEAD_DOSSIER.firm}), accompanied by statutory compliance verification and multi-agent dispatch trace:`,
    widgets: [
      { type: 'lead-qualification', data: SAMPLE_LEAD_DOSSIER },
      { type: 'compliance-gate', data: SAMPLE_COMPLIANCE_GATE },
      { type: 'fleet-trace', data: SAMPLE_FLEET_TRACE },
    ],
  };
}
