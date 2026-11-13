"use client";

import { useMemo, useState } from "react";
import {
  BookOpenText,
  Bot,
  Boxes,
  Building2,
  ChevronDown,
  Database,
  GitBranch,
  Home,
  Network,
  PanelLeftClose,
  Search,
  Settings,
  Sparkles,
  Users,
  MessageSquareText,
  Trash2,
} from "lucide-react";
import { SideNav, SideNavItem, SideNavSection, SideNavHeading } from "@astryxdesign/core/SideNav";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Token } from "@astryxdesign/core/Token";
import { Button as AstryxButton } from "@astryxdesign/core/Button";
import { ThemeAwareBrand } from "@/components/ui/theme-aware-brand";
import { ThemePreferenceControl } from "@/components/ui/theme-switch";
import { useGraphStore, type ViewMode } from "@/lib/graph/store";
import { useAIChatStore } from "@/lib/ai-chat-store";

interface ShellSideNavigationProps {
  onOpenCompanyProfile: () => void;
  onOpenThemeSettings: () => void;
}

const navSections: Array<{
  id: string;
  title: string;
  items: Array<{
    id: ViewMode;
    label: string;
    icon: typeof Home;
    badge?: string;
  }>;
}> = [
  {
    id: "workspace",
    title: "Workspace",
    items: [
      { id: "dashboard", label: "Mission Control", icon: Home },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    items: [{ id: "ai-settings", label: "AI Settings", icon: Settings }],
  },
  {
    id: "pipeline",
    title: "Pipeline",
    items: [
      { id: "network", label: "Knowledge Bank", icon: Network },
      { id: "sources", label: "Documents", icon: Database },
    ],
  },
  {
    id: "operations",
    title: "Systems",
    items: [
      { id: "agents", label: "Agents", icon: Bot },
    ],
  },
  {
    id: "repository",
    title: "Repository",
    items: [
      { id: "architecture", label: "Architecture", icon: GitBranch },
      { id: "catalog", label: "System Catalog", icon: Boxes },
    ],
  },
];

export function ShellSideNavigation({
  onOpenCompanyProfile,
  onOpenThemeSettings,
}: ShellSideNavigationProps) {
  const viewMode = useGraphStore((state) => state.viewMode);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const selectedChatId = useGraphStore((state) => state.selectedChatId);
  const setSelectedChatId = useGraphStore((state) => state.setSelectedChatId);
  const conversations = useAIChatStore((state) => state.conversations);
  const removeConversation = useAIChatStore((state) => state.removeConversation);
  const [chatToDelete, setChatToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingChat, setIsDeletingChat] = useState(false);

  const handleDeleteChat = async () => {
    if (!chatToDelete || isDeletingChat) return;
    setIsDeletingChat(true);
    try {
      await removeConversation(chatToDelete.id);
      if (selectedChatId === chatToDelete.id) {
        setSelectedChatId(null);
        setViewMode("dashboard");
        window.history.pushState({}, "", "/?view=dashboard");
      }
      setChatToDelete(null);
    } catch (err) {
      console.error("Failed to delete chat:", err);
    } finally {
      setIsDeletingChat(false);
    }
  };
  const setCommandOpen = useGraphStore((state) => state.setCommandOpen);
  const snapshot = useGraphStore((state) => state.snapshot);
  const syncState = useGraphStore((state) => state.syncState);
  const sidebarOpen = useGraphStore((state) => state.sidebarOpen);
  const toggleSidebar = useGraphStore((state) => state.toggleSidebar);

  const leads = useMemo(() => {
    return snapshot.nodes.filter((n) => n.id.startsWith("lead-") && !n.deletedAt).slice(0, 4);
  }, [snapshot.nodes]);

  return (
    <>
    <SideNav
      collapsible={false}
      resizable={{ defaultWidth: 280, minWidth: 280, maxWidth: 280 }}
      style={{
        width: sidebarOpen ? 280 : 0,
        minWidth: sidebarOpen ? 280 : 0,
        maxWidth: sidebarOpen ? 280 : 0,
        opacity: sidebarOpen ? 1 : 0,
        overflow: sidebarOpen ? "visible" : "hidden",
        pointerEvents: sidebarOpen ? "auto" : "none",
        flexShrink: 0,
        backgroundColor: "var(--sidebar)",
        borderRight: sidebarOpen ? "1px solid var(--border)" : "none",
        transition: "width 280ms cubic-bezier(0.2, 0.8, 0.2, 1), min-width 280ms cubic-bezier(0.2, 0.8, 0.2, 1), max-width 280ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms ease, border 200ms ease",
      }}
      header={
        <div style={{ padding: "16px 0 10px 0", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: "4px" }}>
            <div
              className="console-brand-mark"
              aria-label="CTXBANKPRO"
              style={{ cursor: "pointer", paddingLeft: "8px" }}
              onClick={() => {
                if (typeof window !== "undefined" && window.location.pathname !== "/") {
                  window.location.assign("/?view=dashboard");
                } else {
                  setViewMode("dashboard");
                }
              }}
            >
              <ThemeAwareBrand width={122} height={36} />
            </div>
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar (⌘B)"
              title="Collapse sidebar (⌘B)"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--foreground-muted, #9ca3af)",
                padding: "6px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 150ms ease, color 150ms ease",
              }}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
          <AstryxButton
            className="global-search"
            endContent={<kbd style={{ fontSize: "11px", opacity: 0.7 }}>⌘ K</kbd>}
            icon={<Search size={14} />}
            label="Search workspace..."
            onClick={() => setCommandOpen(true)}
            size="sm"
            variant="secondary"
          />
        </div>
      }
      footer={
        <SideNavSection title="Account & Preferences" isHeaderHidden>
          <div style={{ padding: "14px 0", display: "flex", flexDirection: "column", gap: "12px" }}>
            <button
              type="button"
              className="company-profile-tag"
              onClick={onOpenCompanyProfile}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 10px",
                borderRadius: "6px",
                cursor: "pointer",
                width: "100%",
              }}
            >
              <span style={{ fontSize: "12px", fontWeight: 600 }}>ASP Private Capital</span>
              <ChevronDown size={13} style={{ opacity: 0.7 }} />
            </button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <ThemePreferenceControl />
              <button
                type="button"
                onClick={onOpenThemeSettings}
                aria-label="Display settings"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--foreground-muted)",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Settings size={16} />
              </button>
            </div>
          </div>
          <SideNavItem
            icon={BookOpenText}
            isSelected={typeof window !== "undefined" && window.location.pathname === "/extension"}
            label="Documentation"
            onClick={() => {
              if (typeof window !== "undefined" && window.location.pathname !== "/extension") {
                window.location.assign("/extension");
              }
            }}
          />
        </SideNavSection>
      }
    >
      {navSections.map((section) => (
        <div key={section.id}>
          <SideNavSection title={section.title}>
            {section.items.map((item) => (
              <SideNavItem key={item.id} icon={item.icon}
                isSelected={typeof window !== "undefined" && window.location.pathname === "/extension" ? false : viewMode === item.id}
                label={item.label}
                onClick={() => {
                  setSelectedChatId(null);
                  setViewMode(item.id);
                  window.history.pushState({}, "", `/?view=${item.id}`);
                }}
              />
            ))}
          </SideNavSection>
          {section.id === "workspace" && conversations.length > 0 && (
            <SideNavSection title="Chats">
              {conversations.map((chat) => (
                <SideNavItem
                  key={chat.id}
                  icon={MessageSquareText}
                  label={chat.title}
                  isSelected={viewMode === "ai-chat" && selectedChatId === chat.id}
                  onClick={() => {
                    setSelectedChatId(chat.id);
                    setViewMode("ai-chat");
                    window.history.pushState({}, "", `/?view=ai-chat&chat=${encodeURIComponent(chat.id)}`);
                  }}
                  endContent={
                    <button
                      type="button"
                      aria-label={`Delete chat "${chat.title}"`}
                      title="Delete chat"
                      onClick={(e) => {
                        e.stopPropagation();
                        setChatToDelete({ id: chat.id, title: chat.title });
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--foreground-muted, #9ca3af)",
                        padding: "4px",
                        borderRadius: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.6,
                        transition: "opacity 150ms ease, color 150ms ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "1";
                        e.currentTarget.style.color = "var(--color-status-error, #f87171)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "0.6";
                        e.currentTarget.style.color = "var(--foreground-muted, #9ca3af)";
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  }
                />
              ))}
            </SideNavSection>
          )}
        </div>
      ))}

      <Divider />

      <SideNavSection title="Validated Leads">
        {leads.length > 0 ? (
          leads.map((lead) => (
            <SideNavItem
              key={lead.id}
              label={lead.label}
              onClick={() => {
                if (typeof window !== "undefined" && window.location.pathname !== "/") {
                  window.location.assign("/?view=network");
                } else {
                  setViewMode("network");
                  useGraphStore.getState().selectNode(lead.id);
                }
              }}
              endContent={
                <StatusDot
                  variant={syncState === "live" ? "success" : "warning"}
                  label={syncState === "live" ? "Synchronized" : "Connecting"}
                />
              }
            />
          ))
        ) : (
          <div style={{ padding: "8px 14px", fontSize: "12px", color: "var(--foreground-muted)" }}>
            No leads loaded yet
          </div>
        )}
      </SideNavSection>
    </SideNav>
    <Dialog
      isOpen={Boolean(chatToDelete)}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isDeletingChat) setChatToDelete(null);
      }}
      purpose="form"
      width={400}
    >
      <DialogHeader
        title="Delete Chat"
        subtitle={`Are you sure you want to delete "${chatToDelete?.title}"? All messages and generated artifacts in this conversation will be permanently removed.`}
        onOpenChange={(isOpen) => {
          if (!isOpen && !isDeletingChat) setChatToDelete(null);
        }}
        startContent={<Trash2 size={18} style={{ color: "var(--color-status-error, #f87171)" }} />}
      />
      <div style={{ padding: "16px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <AstryxButton
          size="sm"
          variant="secondary"
          label="Cancel"
          isDisabled={isDeletingChat}
          onClick={() => setChatToDelete(null)}
        />
        <AstryxButton
          size="sm"
          variant="destructive"
          label={isDeletingChat ? "Deleting..." : "Delete Chat"}
          isDisabled={isDeletingChat}
          onClick={() => void handleDeleteChat()}
        />
      </div>
    </Dialog>
    </>
  );
}
