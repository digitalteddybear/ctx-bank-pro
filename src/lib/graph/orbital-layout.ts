import type { GraphSnapshot, KnowledgeNode } from "./types";
import { humanizeValue } from "./lead-dossier";

export const orbitSegments = [
  { tag: "B2B_CORPORATE", label: "Corporate", color: "blue" },
  { tag: "B2C_PERSONAL", label: "Personal", color: "green" },
  { tag: "B2B_INSTITUTIONAL", label: "Institutional", color: "yellow" },
  { tag: "B2B", label: "Entity", color: "purple" },
] as const;

export type OrbitNode = KnowledgeNode & {
  tier: number; x: number; y: number; fx: number; fy: number;
  color: string; parentId?: string; recordId: string; members: string[];
  classification: string;
};
export type OrbitLink = { source: OrbitNode; target: OrbitNode };

/** A presentation-only hierarchy. Synthetic groups never enter the graph store or API. */
export function buildOrbitalLayout(snapshot: GraphSnapshot) {
  const active = snapshot.nodes.filter(node => !node.deletedAt);
  const root = active.find(node => node.id === "asp-invest") ?? active.find(node => node.type === "organization") ?? active[0];
  if (!root) return { nodes: [] as OrbitNode[], links: [] as OrbitLink[] };
  const nodes: OrbitNode[] = [];
  const links: OrbitLink[] = [];
  const add = (record: KnowledgeNode, tier: number, angle: number, radius: number, color: string, classification: string, parent?: OrbitNode, members: string[] = [], label = record.label, id = record.id) => {
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    const node: OrbitNode = { ...record, id, label, tier, x, y, fx: x, fy: y, color, classification, parentId: parent?.id, recordId: record.id, members };
    nodes.push(node);
    if (parent) links.push({ source: parent, target: node });
    return node;
  };
  const rootNode = add(root, 0, 0, 0, "green", "Organization");
  const leads = active.filter(node => node.id.startsWith("lead-"));
  const grouped = orbitSegments.map(segment => ({ ...segment, leads: leads.filter(node => (orbitSegments.find(s => node.tags.includes(s.tag))?.tag ?? "B2B") === segment.tag).sort((a,b) => a.label.localeCompare(b.label)) }));
  const weights = grouped.map(group => Math.max(0.065, group.leads.length / Math.max(1, leads.length)));
  const totalWeight = weights.reduce((a,b) => a+b, 0);
  let start = -Math.PI / 2;
  grouped.forEach((group, index) => {
    const span = Math.PI * 2 * weights[index] / totalWeight;
    const end = start + span;
    const record = active.find(node => node.id === `segment-${group.tag.toLowerCase()}`) ?? root;
    const segment = add(record, 1, (start + end)/2, 160, group.color, `${group.label} · ${group.leads.length} prospects`, rootNode, group.leads.map(n => n.id), group.label);
    const reachGroups = Map.groupBy(group.leads, lead => lead.tags.find(tag => tag.includes("REACHABLE")) ?? "Unclassified");
    let cursor = start + 0.035;
    let leadOrdinal = 0;
    const usable = Math.max(0, span - 0.07);
    for (const [reach, members] of reachGroups) {
      const reachSpan = usable * members.length / Math.max(1, group.leads.length);
      const subgroup = add(record, 2, cursor + reachSpan/2, 280, "subgroup", group.label, segment, members.map(n => n.id), humanizeValue(reach), `orbit:${group.tag}:${reach}`);
      const alphabet = Map.groupBy(members, lead => {
        const first = lead.label.charAt(0).toUpperCase();
        return first < "G" ? "A–F" : first < "M" ? "G–L" : first < "S" ? "M–R" : "S–Z";
      });
      let functionalCursor = cursor;
      for (const [range, rangeMembers] of alphabet) {
        const functionalSpan = reachSpan * rangeMembers.length / members.length;
        const block = add(record, 3, functionalCursor + functionalSpan/2, 380, "functional", humanizeValue(reach), subgroup, rangeMembers.map(n => n.id), `Contact directory · ${range}`, `${subgroup.id}:${range}`);
        for (let offset = 0; offset < rangeMembers.length; offset += 20) {
          const batch = rangeMembers.slice(offset, offset + 20);
          const angle = functionalCursor + functionalSpan * (offset + batch.length/2) / rangeMembers.length;
          const task = add(record, 4, angle, 460, "red", `${group.label} · ${humanizeValue(reach)}`, block, batch.map(n => n.id), `Dossier review · ${batch[0].label} – ${batch.at(-1)!.label}`, `${block.id}:${offset}`);
          batch.forEach(lead => {
            const leadIndex = leadOrdinal++;
            // Multiple concentric perimeter lanes keep all dossiers individually hittable.
            const capacity = Math.max(1, Math.floor(usable * 540 / 24));
            const lanes = Math.max(1, Math.ceil(group.leads.length / capacity));
            const lane = leadIndex % lanes;
            const leadAngle = start + 0.035 + usable * (leadIndex + 0.5) / group.leads.length;
            add(lead, 5, leadAngle, 540 + lane * 24, group.color, `${group.label} · ${humanizeValue(reach)}`, task, [lead.id]);
          });
        }
        functionalCursor += functionalSpan;
      }
      cursor += reachSpan;
    }
    start = end;
  });
  // Preserve visibility of additional graph records without inventing data relationships.
  const included = new Set(nodes.map(node => node.recordId));
  const others = active.filter(node => !included.has(node.id));
  others.forEach((node,index) => add(node, 3, index * Math.PI * 2 / Math.max(1, others.length), 340, "purple", node.type, rootNode));
  return { nodes, links };
}
