"use client";

import { useState, useMemo } from "react";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Check,
  Code2,
  Copy,
  FileCode,
  Hash,
  LayoutGrid,
  ListFilter,
  Sparkles,
  Tag,
  Terminal,
} from "lucide-react";
import { Heading, Text } from "@astryxdesign/core/Text";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@/components/ui/primitives";
import {
  PLATFORM_SECTIONS,
  PLATFORM_FEATURES,
  TEMPLATE_MAPPINGS,
  INSTRUCTIONAL_GUIDE,
} from "@/content/platform-taxonomy";
import { useGraphStore, type ViewMode } from "@/lib/graph/store";

export function CatalogDashboardView() {
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "sections" | "features" | "templates" | "prompt-guide">("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedTag(text);
    setTimeout(() => {
      setCopiedTag((current) => (current === text ? null : current));
    }, 2000);
  };

  const categories = useMemo(() => {
    const cats = new Set(PLATFORM_FEATURES.map((f) => f.category));
    return ["ALL", ...Array.from(cats)];
  }, []);

  const filteredSections = useMemo(() => {
    if (activeTab === "features" || activeTab === "templates" || activeTab === "prompt-guide") return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return PLATFORM_SECTIONS;
    return PLATFORM_SECTIONS.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.primaryComponent.toLowerCase().includes(q) ||
        s.instructionalTags.some((t) => t.toLowerCase().includes(q))
    );
  }, [searchQuery, activeTab]);

  const filteredFeatures = useMemo(() => {
    if (activeTab === "sections" || activeTab === "templates" || activeTab === "prompt-guide") return [];
    const q = searchQuery.toLowerCase().trim();
    return PLATFORM_FEATURES.filter((f) => {
      const matchesCategory = selectedCategory === "ALL" || f.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        f.id.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.sectionLabel.toLowerCase().includes(q) ||
        f.componentPath.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.instructionalTags.some((t) => t.toLowerCase().includes(q)) ||
        (f.templateSource && f.templateSource.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, activeTab, selectedCategory]);

  return (
    <div
      className="workspace catalog-dashboard-view catalog-workspace-wrap"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "28px",
        padding: "36px 40px 60px 40px",
        maxWidth: "1500px",
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Top Header matching Agents North Star */}
      <section
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "1px solid var(--border)",
          paddingBottom: "18px",
        }}
      >
        <div>
          <Heading level={1} id="catalog-title">
            System Catalog & Feature Registry
          </Heading>
          <Text color="secondary" type="body">
            Standardized directory of platform sections, features, component mappings, and instructional prompt tags.
          </Text>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.location.assign("/extension")}
          >
            <BookOpen size={13} /> View Documentation
          </Button>
        </div>
      </section>

      {/* KPI Metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "14px",
        }}
      >
        <div
          style={{
            padding: "16px",
            borderRadius: "8px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--foreground-muted)", fontSize: "12px", fontWeight: 600 }}>
            <span>SECTIONS</span>
            <LayoutGrid size={15} style={{ opacity: 0.7 }} />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, marginTop: "8px" }}>
            {PLATFORM_SECTIONS.length}
          </div>
          <div style={{ fontSize: "12px", color: "var(--foreground-muted)", marginTop: "4px" }}>
            Primary app workspaces
          </div>
        </div>

        <div
          style={{
            padding: "16px",
            borderRadius: "8px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--foreground-muted)", fontSize: "12px", fontWeight: 600 }}>
            <span>REGISTERED FEATURES</span>
            <Boxes size={15} style={{ opacity: 0.7 }} />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, marginTop: "8px" }}>
            {PLATFORM_FEATURES.length}
          </div>
          <div style={{ fontSize: "12px", color: "var(--foreground-muted)", marginTop: "4px" }}>
            Subsystems & UI modules
          </div>
        </div>

        <div
          style={{
            padding: "16px",
            borderRadius: "8px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--foreground-muted)", fontSize: "12px", fontWeight: 600 }}>
            <span>ASTRYX TEMPLATES</span>
            <Code2 size={15} style={{ opacity: 0.7 }} />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, marginTop: "8px" }}>
            {TEMPLATE_MAPPINGS.length}
          </div>
          <div style={{ fontSize: "12px", color: "var(--foreground-muted)", marginTop: "4px" }}>
            Restored production designs
          </div>
        </div>

        <div
          style={{
            padding: "16px",
            borderRadius: "8px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--foreground-muted)", fontSize: "12px", fontWeight: 600 }}>
            <span>MCP AGENT TOOLS</span>
            <Terminal size={15} style={{ opacity: 0.7 }} />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, marginTop: "8px" }}>14</div>
          <div style={{ fontSize: "12px", color: "var(--foreground-muted)", marginTop: "4px" }}>
            Stdio protocol endpoints
          </div>
        </div>

        <div
          style={{
            padding: "16px",
            borderRadius: "8px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--foreground-muted)", fontSize: "12px", fontWeight: 600 }}>
            <span>INSTRUCTIONAL TAGS</span>
            <Tag size={15} style={{ opacity: 0.7 }} />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, marginTop: "8px" }}>
            {PLATFORM_FEATURES.reduce((acc, f) => acc + f.instructionalTags.length, 0)}
          </div>
          <div style={{ fontSize: "12px", color: "var(--foreground-muted)", marginTop: "4px" }}>
            Prompt-ready tags
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "16px",
        }}
      >
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          {/* Search box */}
          <div style={{ flex: 1, minWidth: "260px", maxWidth: "480px" }}>
            <TextInput
              label="Search catalog"
              isLabelHidden
              placeholder="Search sections, features, paths, tags..."
              value={searchQuery}
              onChange={setSearchQuery}
              hasClear
            />
          </div>

          {/* View Tab Selector */}
          <SegmentedControl
            label="Catalog view filter"
            size="sm"
            value={activeTab}
            onChange={(val) => setActiveTab(val as typeof activeTab)}
          >
            <SegmentedControlItem value="all" label="All Items" />
            <SegmentedControlItem value="sections" label={`Sections (${PLATFORM_SECTIONS.length})`} />
            <SegmentedControlItem value="features" label={`Features (${PLATFORM_FEATURES.length})`} />
            <SegmentedControlItem value="templates" label={`Astryx Templates (${TEMPLATE_MAPPINGS.length})`} />
            <SegmentedControlItem value="prompt-guide" label="Prompt Guide" />
          </SegmentedControl>
        </div>

        {/* Category Pills (Active on All or Features) */}
        {(activeTab === "all" || activeTab === "features") && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", paddingTop: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--foreground-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
              <ListFilter size={12} /> Category:
            </span>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "14px",
                  fontSize: "12px",
                  fontWeight: selectedCategory === cat ? 600 : 400,
                  background: selectedCategory === cat ? "var(--foreground)" : "rgba(255, 255, 255, 0.05)",
                  color: selectedCategory === cat ? "var(--background)" : "var(--foreground)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sections Registry (Rendered when 'all' or 'sections') */}
      {(activeTab === "all" || activeTab === "sections") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <LayoutGrid size={16} style={{ color: "var(--foreground-muted)" }} />
              <Heading level={2}>
                Platform Sections ({filteredSections.length})
              </Heading>
            </div>
            <Text color="secondary" type="supporting">
              Top-level application workspaces
            </Text>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
              gap: "16px",
            }}
          >
            {filteredSections.map((sec) => (
              <div
                key={sec.id}
                style={{
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "14px",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <code
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "3px 7px",
                        borderRadius: "4px",
                        background: "rgba(59, 130, 246, 0.15)",
                        color: "#3b82f6",
                      }}
                    >
                      {sec.id}
                    </code>
                    <span style={{ fontSize: "11px", color: "var(--foreground-muted)", fontWeight: 500 }}>
                      {sec.owner}
                    </span>
                  </div>

                  <h3 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 6px 0", color: "var(--foreground)" }}>
                    {sec.title}
                  </h3>

                  <p style={{ fontSize: "13px", color: "var(--foreground-muted)", margin: "0 0 12px 0", lineHeight: 1.5 }}>
                    {sec.description}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--foreground-muted)", marginBottom: "12px" }}>
                    <FileCode size={13} style={{ opacity: 0.7 }} />
                    <code style={{ fontSize: "11px", opacity: 0.85 }}>{sec.primaryComponent}</code>
                  </div>

                  {/* Instructional Tags */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {sec.instructionalTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => copyToClipboard(tag)}
                        title="Click to copy tag"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "2px 7px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          background: copiedTag === tag ? "rgba(34, 197, 94, 0.2)" : "rgba(255, 255, 255, 0.05)",
                          color: copiedTag === tag ? "#22c55e" : "var(--foreground)",
                          border: "1px solid var(--border)",
                          cursor: "pointer",
                        }}
                      >
                        {copiedTag === tag ? <Check size={10} /> : <Hash size={10} style={{ opacity: 0.6 }} />}
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderTop: "1px solid var(--border)",
                    paddingTop: "12px",
                    marginTop: "4px",
                  }}
                >
                  <span style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>
                    Route: <code style={{ fontSize: "11px" }}>{sec.route}</code>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (sec.viewMode) {
                        setViewMode(sec.viewMode as ViewMode);
                      } else {
                        window.location.assign(sec.route);
                      }
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "5px 10px",
                      borderRadius: "5px",
                      fontSize: "12px",
                      fontWeight: 500,
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      cursor: "pointer",
                    }}
                  >
                    Open View
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Features & Component Registry Table (Rendered when 'all' or 'features') */}
      {(activeTab === "all" || activeTab === "features") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Boxes size={16} style={{ color: "var(--foreground-muted)" }} />
              <Heading level={2}>
                Feature & Component Inventory ({filteredFeatures.length})
              </Heading>
            </div>
            <Text color="secondary" type="supporting">
              Subsystems, Astryx templates, and instructional prompt targets
            </Text>
          </div>

          <div
            style={{
              overflowX: "auto",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "rgba(255, 255, 255, 0.02)" }}>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--foreground-muted)", fontSize: "12px" }}>FEATURE / ASSET</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--foreground-muted)", fontSize: "12px" }}>SECTION</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--foreground-muted)", fontSize: "12px" }}>COMPONENT PATH</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--foreground-muted)", fontSize: "12px" }}>STATUS</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--foreground-muted)", fontSize: "12px" }}>INSTRUCTIONAL TAGS</th>
                </tr>
              </thead>
              <tbody>
                {filteredFeatures.map((feat) => (
                  <tr
                    key={feat.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      transition: "background 0.15s ease",
                    }}
                  >
                    <td style={{ padding: "14px 16px", verticalAlign: "top" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{feat.name}</span>
                        </div>
                        <code
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "#8b5cf6",
                            display: "inline-block",
                          }}
                        >
                          {feat.id}
                        </code>
                        <span style={{ fontSize: "12px", color: "var(--foreground-muted)", marginTop: "2px", lineHeight: 1.4 }}>
                          {feat.description}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: "14px 16px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 500,
                          padding: "2px 8px",
                          borderRadius: "12px",
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {feat.sectionLabel}
                      </span>
                    </td>

                    <td style={{ padding: "14px 16px", verticalAlign: "top" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <code style={{ fontSize: "11px", color: "var(--foreground)", wordBreak: "break-all" }}>
                          {feat.componentPath}
                        </code>
                        {feat.templateSource && (
                          <span style={{ fontSize: "10px", color: "#10b981", fontWeight: 500 }}>
                            Astryx: {feat.templateSource.replace("npx @astryxdesign/cli template ", "").split(" ")[0]}
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: "14px 16px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background:
                            feat.status === "Restored Template"
                              ? "rgba(16, 185, 129, 0.15)"
                              : feat.status === "Core Infrastructure"
                              ? "rgba(245, 158, 11, 0.15)"
                              : "rgba(59, 130, 246, 0.15)",
                          color:
                            feat.status === "Restored Template"
                              ? "#10b981"
                              : feat.status === "Core Infrastructure"
                              ? "#f59e0b"
                              : "#3b82f6",
                        }}
                      >
                        {feat.status}
                      </span>
                    </td>

                    <td style={{ padding: "14px 16px", verticalAlign: "top" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxWidth: "320px" }}>
                        {feat.instructionalTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => copyToClipboard(tag)}
                            title="Click to copy tag"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              background: copiedTag === tag ? "rgba(34, 197, 94, 0.2)" : "rgba(255, 255, 255, 0.05)",
                              color: copiedTag === tag ? "#22c55e" : "var(--foreground)",
                              border: "1px solid var(--border)",
                              cursor: "pointer",
                            }}
                          >
                            {copiedTag === tag ? <Check size={10} /> : <Tag size={10} style={{ opacity: 0.6 }} />}
                            {tag}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Astryx Template Reference Map (Rendered when 'all' or 'templates') */}
      {(activeTab === "all" || activeTab === "templates") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Code2 size={16} style={{ color: "var(--foreground-muted)" }} />
              <Heading level={2}>
                Astryx CLI Template Mappings ({TEMPLATE_MAPPINGS.length})
              </Heading>
            </div>
            <Text color="secondary" type="supporting">
              Exact source designs preserved in the production build
            </Text>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
              gap: "14px",
            }}
          >
            {TEMPLATE_MAPPINGS.map((tpl) => (
              <div
                key={tpl.templateName}
                style={{
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--foreground)" }}>
                    {tpl.templateName}
                  </span>
                  <code style={{ fontSize: "11px", fontWeight: 700, color: "#10b981" }}>
                    {tpl.featureId}
                  </code>
                </div>

                <p style={{ fontSize: "13px", color: "var(--foreground-muted)", margin: 0, lineHeight: 1.4 }}>
                  {tpl.description}
                </p>

                <div
                  style={{
                    background: "rgba(0, 0, 0, 0.25)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "8px 10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                  }}
                >
                  <code style={{ fontSize: "11px", color: "#10b981", wordBreak: "break-all" }}>
                    {tpl.cliCommand}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(tpl.cliCommand)}
                    title="Copy command"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: copiedTag === tpl.cliCommand ? "#22c55e" : "var(--foreground-muted)",
                      cursor: "pointer",
                      padding: "2px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {copiedTag === tpl.cliCommand ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>

                <div style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>
                  Live Component: <code style={{ fontSize: "11px" }}>{tpl.livePath}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructional Prompt Guide (Rendered when 'all' or 'prompt-guide') */}
      {(activeTab === "all" || activeTab === "prompt-guide") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Sparkles size={16} style={{ color: "var(--foreground-muted)" }} />
              <Heading level={2}>
                Instructional Prompting Reference Guide
              </Heading>
            </div>
            <Text color="secondary" type="supporting">
              How to reference sections, features, and components in user prompts
            </Text>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "14px",
            }}
          >
            {INSTRUCTIONAL_GUIDE.syntaxGuide.map((guide) => (
              <div
                key={guide.format}
                style={{
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <code
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#f59e0b",
                    alignSelf: "flex-start",
                    background: "rgba(245, 158, 11, 0.1)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  {guide.format}
                </code>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--foreground)" }}>
                  {guide.purpose}
                </span>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--foreground-muted)",
                    background: "rgba(0, 0, 0, 0.2)",
                    padding: "8px 10px",
                    borderRadius: "5px",
                    border: "1px solid var(--border)",
                    fontFamily: "monospace",
                  }}
                >
                  Example: "{guide.example}"
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
