"use client";

import { useMemo } from "react";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { List, ListItem } from "@astryxdesign/core/List";
import { Avatar } from "@astryxdesign/core/Avatar";
import { BookOpenText, Bot, Brain, Briefcase, ChevronLeft, Cpu, Cuboid, Database, Folder, GitBranch, GitCommit, Grid2X2, Home, Layers, Network, Shield, Users, X } from "lucide-react";
import { IconButton } from "@/components/ui/primitives";
import { useGraphStore } from "@/lib/graph/store";
import { buildOrbitalLayout, orbitSegments } from "@/lib/graph/orbital-layout";

const groups = [
  { title: "Workspace", items: [{ label: "Roadmap", icon: Briefcase }, { label: "Reference Model", icon: Network }, { label: "Compliance", icon: Shield }] },
  { title: "Platforms", items: [{ label: "Agents", icon: Bot }, { label: "Copilots", icon: Cpu }, { label: "AI Brains", icon: Brain }, { label: "Autonomous", icon: GitBranch }, { label: "AI Tool Library", icon: Database }] },
  { title: "Infrastructure", items: [{ label: "People", icon: Users }, { label: "Teams", icon: Folder }, { label: "Projects", icon: Layers }, { label: "Departments", icon: Grid2X2 }, { label: "Org Chart", icon: GitCommit }] },
];

export function WorkspaceNavigation({ active, extended, onNavigate, onCloseContext, onClose }: {
  active: string; extended: boolean; onNavigate: (label: string) => void; onCloseContext: () => void; onClose: () => void;
}) {
  const snapshot = useGraphStore(state => state.snapshot);
  const selectedNodeId = useGraphStore(state => state.selectedNodeId);
  const selectNode = useGraphStore(state => state.selectNode);
  const setViewMode = useGraphStore(state => state.setViewMode);
  const syncState = useGraphStore(state => state.syncState);
  const { nodes } = useMemo(() => buildOrbitalLayout(snapshot), [snapshot]);
  const selected = snapshot.nodes.find(node => node.id === selectedNodeId && !node.deletedAt);
  const leads = snapshot.nodes.filter(node => node.id.startsWith("lead-") && !node.deletedAt);
  const openRecord = (id: string) => { setViewMode("network"); selectNode(id); if (window.innerWidth <= 820) onClose(); };
  const contextCopy: Record<string, string> = {
    Roadmap: "Explore the retained contact cohort and its validation stages.",
    "Reference Model": "Organization, classifications, reachability, directories, review groups and dossiers.",
    Compliance: "Recorded validation evidence and source provenance. Reachability does not establish permission for outreach.",
    Agents: "Dossier review groups available for agent inspection.",
    Copilots: "Contact directories and source evidence for assisted review.",
    "AI Brains": "ASP Private Capital knowledge and its connected contact dossiers.",
    Autonomous: "Review groups derived from the contact directory. No workflows are running from this view.",
    "AI Tool Library": "Browse the source records available to the workspace.",
    People: "The complete retained prospect directory is available in 2D map and search.",
    Teams: "Contacts grouped by classification; team membership is not recorded in this dataset.",
    Projects: "ASP Private Capital Phase 1 contact validation.",
    Departments: "Classification groups provide the current organizational view.",
    "Org Chart": "Explore the hierarchy from ASP Private Capital to each individual dossier.",
  };
  return <>
    <SideNav className="rail enterprise-rail" header={<HStack gap={2} vAlign="center" padding={3}>
      <Cuboid size={18} /><Text weight="semibold">CTX Bank PRO</Text>
      <IconButton label="Close navigation" onClick={onClose}><X size={14} /></IconButton>
    </HStack>} footer={<VStack gap={1}>
      <SideNavItem icon={<BookOpenText size={16} />} label="Documentation" onClick={() => window.location.assign("/extension")} />
      <HStack className="workspace-profile" gap={2} padding={3} vAlign="center"><Avatar name="Workspace user" size="sm" /><VStack gap={0}><Text>Workspace user</Text><Text type="supporting" color="secondary">{syncState === "live" ? "Active · Connected" : "Connecting"}</Text></VStack></HStack>
    </VStack>}>
      <SideNavSection title="Mission Control" isHeaderHidden>
        <SideNavItem icon={<Home size={16} />} label="Mission Control" onClick={() => setViewMode("dashboard")} />
        <SideNavItem icon={<Network size={16} />} label="Knowledge Bank" onClick={() => setViewMode("network")} />
        <SideNavItem icon={<Database size={16} />} label="Documents & Sources" onClick={() => setViewMode("sources")} />
      </SideNavSection>
      {groups.map(group => <SideNavSection title={group.title} key={group.title}>
        {group.items.map(item => <SideNavItem key={item.label} label={item.label} icon={<item.icon size={16} />} isSelected={active === item.label} onClick={() => onNavigate(item.label)} />)}
      </SideNavSection>)}
    </SideNav>
    <VStack as="aside" className={`workspace-context ${extended ? "is-open" : ""}`} aria-label="Workspace context" inert={!extended} gap={0}>
      <HStack className="workspace-context__heading" padding={3} gap={2} vAlign="center" hAlign="between"><Text weight="semibold">{active}</Text><IconButton label="Close context panel" onClick={onCloseContext}><ChevronLeft size={16} /></IconButton></HStack>
      <VStack className="workspace-context__scroll" isScrollable gap={4} padding={3}>
        <HStack gap={2} vAlign="center"><Avatar name={selected?.label ?? "ASP Private Capital"} size="md" /><VStack gap={0}><Text weight="semibold">{selected?.label ?? "ASP Private Capital"}</Text><Text type="supporting" color="secondary">{selected?.id.startsWith("lead-") ? "Prospect dossier" : `${leads.length} connected prospects`}</Text></VStack></HStack>
        <Text color="secondary" type="supporting">{contextCopy[active]}</Text>
        <List density="compact" header="Classifications">
          {orbitSegments.map(segment => <ListItem key={segment.tag} label={segment.label} startContent={<Users size={14} />} endContent={<Text type="supporting">{nodes.find(node => node.tier === 1 && node.label === segment.label)?.members.length ?? 0}</Text>} onClick={() => openRecord(`segment-${segment.tag.toLowerCase()}`)} />)}
        </List>
        <List density="compact" header={active === "People" ? "Prospects" : "Connected prospects"}>
          {leads.slice(0,5).map(lead => <ListItem key={lead.id} label={lead.label} startContent={<Avatar name={lead.label} size="sm" />} onClick={() => openRecord(lead.id)} />)}
        </List>
        <List density="compact" header="Validation groups">
          {nodes.filter(node => node.tier === 2).slice(0,6).map(node => <ListItem key={node.id} label={node.label} description={`${node.classification} · ${node.members.length} prospects`} startContent={<Shield size={14} />} onClick={() => openRecord(node.recordId)} />)}
        </List>
        <List density="compact" header="Dossier review groups">
          {nodes.filter(node => node.tier === 4).slice(0,5).map(node => <ListItem key={node.id} label={node.label.replace("Dossier review · ", "")} description={`${node.members.length} dossiers`} startContent={<Bot size={14} />} onClick={() => openRecord(node.members[0])} />)}
        </List>
      </VStack>
    </VStack>
  </>;
}
