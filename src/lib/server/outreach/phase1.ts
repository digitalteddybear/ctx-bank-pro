import { loadLeadGraph } from "../lead-corpus";

/** Reuse the app's canonical Phase 1 loader. No independent copy or outbound model access. */
export async function phase1Context(id?: string) {
  const snapshot = await loadLeadGraph();
  const leads = snapshot.nodes.filter(node => node.id.startsWith("lead-") && !node.deletedAt);
  const summary = { generatedAt: snapshot.generatedAt, retained: leads.length, source: "CTX Phase 1 canonical loader", readOnly: true, externalModelUse: false, eligibilityInference: false };
  if (!id) return summary;
  const dossier = leads.find(node => node.id === id);
  if (!dossier) throw new Error("Phase 1 dossier not found");
  return { ...summary, dossier, notice: "Historical evidence only. Not permission, investor qualification or campaign eligibility. Cannot create an outreach run from this endpoint." };
}

/** Full retained dossier for sandbox simulation. It is read-only and never writes back to Phase 1. */
export async function phase1SandboxProspect(id: string) {
  const snapshot = await loadLeadGraph();
  const node = snapshot.nodes.find(item => item.id === id && item.id.startsWith("lead-") && !item.deletedAt);
  if (!node?.sources[0]?.excerpt) throw new Error("Phase 1 dossier not found");
  const dossier = node.sources[0].excerpt;
  const facts = dossier.split("\n").filter(line => /^- \*\*[^:]+:\*\* /.test(line)).slice(0, 100).map(text => ({ text, source: node.sources[0].sourceId }));
  const email = dossier.match(/^# Contact Email:\s*`([^`]+)`/m)?.[1]?.trim() ?? dossier.match(/^- \*\*Raw Email:\*\*\s*(\S+)/m)?.[1]?.trim();
  if (!email || !/^\S+@\S+$/.test(email)) throw new Error("Phase 1 dossier has no valid contact email");
  return {
    id: node.id,
    name: node.label,
    email,
    permission: "unknown" as const,
    facts,
    dossier,
    phase1LeadId: node.id,
    phase1Validated: true,
    tags: ["phase1_validated", "asp_approved_cohort", "scope:relationship-reactivation"],
  };
}

/** Verify if an email belongs to a retained Phase 1 validated lead. */
export async function findPhase1LeadByEmail(email: string) {
  const normalizedTarget = email.toLowerCase().trim();
  const snapshot = await loadLeadGraph();
  const lead = snapshot.nodes.find(node => {
    if (!node.id.startsWith("lead-") || node.deletedAt) return false;
    const excerpt = node.sources[0]?.excerpt;
    if (!excerpt) return false;
    const leadEmail = excerpt.match(/^# Contact Email:\s*`([^`]+)`/m)?.[1]?.trim() ??
      excerpt.match(/^- \*\*Raw Email:\*\*\s*(\S+)/m)?.[1]?.trim();
    return leadEmail?.toLowerCase().trim() === normalizedTarget;
  });
  return lead ?? null;
}
