// Copyright (c) Meta Platforms, Inc. and affiliates.

export type OrbDisplayState =
  | 'working'
  | 'searching'
  | 'solving'
  | 'listening'
  | 'connecting'
  | 'weaving'
  | 'composing'
  | 'breathing'
  | 'shaping';

export type GenerativeWidgetType =
  | 'lead-qualification'
  | 'compliance-gate'
  | 'architecture-diff'
  | 'neural-subgraph'
  | 'fleet-trace';

export interface EvidenceCitation {
  id: string;
  title: string;
  source: string;
  verified: boolean;
  timestamp?: string;
  uri?: string;
}

export interface LeadQualificationData {
  leadId: string;
  name: string;
  role: string;
  firm: string;
  location: string;
  aum?: string;
  classification: string;
  confidenceScore: number;
  statutoryBasis: string;
  citations: EvidenceCitation[];
  notes: string;
  targetNodeId?: string;
}

export interface ComplianceCheckItem {
  id: string;
  regulation: string; // e.g. "FSMA 2000 Section 21"
  status: 'passed' | 'warning' | 'hold';
  detail: string;
  fingerprint: string;
  statutoryArticle: string;
}

export interface ComplianceGateData {
  auditId: string;
  targetEntity: string;
  evaluatedAt: string;
  checks: ComplianceCheckItem[];
  overallStatus: 'passed' | 'hold' | 'warning';
  statutoryHash: string;
}

export interface DiffLine {
  type: 'context' | 'added' | 'removed';
  content: string;
  lineNumber?: number;
}

export interface ArchitectureDiffData {
  fileId?: string;
  filePath: string;
  language: string;
  summary: string;
  targetCommitHash?: string;
  diffLines: DiffLine[];
  proposedContent?: string;
  baseHash?: string;
  revision?: string | null;
}

export interface SubGraphNode {
  id: string;
  label: string;
  type: 'lead' | 'organization' | 'regulation' | 'portfolio' | 'agent';
  confidence?: number;
}

export interface SubGraphEdge {
  from: string;
  to: string;
  relation: string;
}

export interface NeuralSubGraphData {
  query: string;
  rootNodeId: string;
  nodes: SubGraphNode[];
  edges: SubGraphEdge[];
  summary: string;
}

export interface FleetTraceStep {
  agentId: string;
  agentName: string;
  role: string;
  status: 'completed' | 'running' | 'queued';
  latencyMs: number;
  summary: string;
}

export interface FleetTraceData {
  dispatchId: string;
  trigger: string;
  totalLatencyMs: number;
  steps: FleetTraceStep[];
}

export type GenerativeWidgetPayload =
  | { type: 'lead-qualification'; data: LeadQualificationData }
  | { type: 'compliance-gate'; data: ComplianceGateData }
  | { type: 'architecture-diff'; data: ArchitectureDiffData }
  | { type: 'neural-subgraph'; data: NeuralSubGraphData }
  | { type: 'fleet-trace'; data: FleetTraceData };

export interface OrchestratorMessage {
  id: string;
  sender: 'user' | 'orchestrator' | 'system';
  timestamp: string;
  text?: string;
  widgets?: GenerativeWidgetPayload[];
}
