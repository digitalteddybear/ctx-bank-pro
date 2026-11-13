"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Boxes, Building2, Settings } from "lucide-react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Button } from "@/components/ui/primitives";
import packageJson from "../../../package.json";
import { extensionDocs } from "@/content/extension-docs";
import { ExtensionNav } from "./extension-nav";
import styles from "./page.module.css";
import { ShellSideNavigation } from "@/components/network/shell-side-navigation";
import { CommandPalette } from "@/components/network/command-palette";
import { ThemePreferenceControl } from "@/components/ui/theme-switch";

type Row = readonly string[];

function ReferenceTable({
  headings,
  rows,
}: {
  headings: readonly string[];
  rows: readonly Row[];
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {headings.map((heading) => <th key={heading}>{heading}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join(":")}>
              {row.map((cell, index) => <td key={`${cell}:${index}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tags({ values }: { values: readonly string[] }) {
  return (
    <div className={styles.tagList}>
      {values.map((value) => <code className={styles.tag} key={value}>{value}</code>)}
    </div>
  );
}

function CompanyProfileOverlay({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="info" width={400}>
      <DialogHeader
        onOpenChange={onOpenChange}
        startContent={<Building2 size={18} />}
        subtitle="Organization profile"
        title="ASP Private Capital"
      />
      <p>ASP Private Capital is the active organization for this Context Bank workspace.</p>
      <dl>
        <div><dt>Organization</dt><dd>ASP Private Capital</dd></div>
        <div><dt>Workspace</dt><dd>Context Bank</dd></div>
      </dl>
    </Dialog>
  );
}

export default function ExtensionDocsPage() {
  const { release, scope } = extensionDocs;
  const toolCount = extensionDocs.mcpTools.read.length + extensionDocs.mcpTools.write.length;
  const [companyProfileOpen, setCompanyProfileOpen] = useState(false);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);

  return (
    <div className="app-shell is-ready" style={{ height: "100vh", overflow: "hidden" }}>
      <AppShell
        variant="wash"
        contentPadding={0}
        height="fill"
        sideNav={
          <ShellSideNavigation
              profileRole="administrator"
            onOpenCompanyProfile={() => setCompanyProfileOpen(true)}
            onOpenThemeSettings={() => setThemeSettingsOpen(true)}
          />
        }
      >
        <div
          className="main-scroll-container"
          style={{
            height: "100%",
            width: "100%",
            overflowY: "auto",
            position: "relative",
            backgroundColor: "var(--background)",
          }}
        >
          <div className={`${styles.layout} docs-workspace-wrap`}>
            <ExtensionNav />

            <main className={styles.main}>
              {/* Top Header matching Agents North Star */}
              <section
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: "18px",
                  marginBottom: "24px",
                }}
              >
                <div>
                  <Heading level={1} id="docs-title">
                    Documentation
                  </Heading>
                  <Text color="secondary" type="body">
                    Platform specifications, architecture taxonomy, and MCP tool reference for ASP Private Capital.
                  </Text>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      padding: "4px 10px",
                      borderRadius: "6px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground-muted)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    v{packageJson.version}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.location.assign("/?view=catalog");
                      }
                    }}
                  >
                    <Boxes size={13} /> System Catalog
                  </Button>
                </div>
              </section>

              {/* Lede Summary & Release Facts */}
              <section className={styles.hero} style={{ marginBottom: "28px" }}>
                <p className={styles.lede}>
                  CTX BankPro is an agentic contextual engineering and autonomous operations platform tailored for
                  ASP Private Capital: manage and synthesize private market knowledge, operate multi-agent outreach
                  workflows, and query authoritative graph intelligence through MCP, HTTP, and generative UI.
                </p>

                <div className={styles.facts}>
                  <div className={styles.fact}><span>Reviewed</span><strong>{release.reviewedOn}</strong></div>
                  <div className={styles.fact}><span>Graph schema</span><strong>{release.schemaVersion}</strong></div>
                  <div className={styles.fact}><span>MCP tools</span><strong>{toolCount}</strong></div>
                  <div className={styles.fact}><span>Persistence</span><strong>{release.storage}</strong></div>
                  <div className={styles.fact}><span>Frontend sync</span><strong>{release.syncInterval}</strong></div>
                </div>
              </section>

              {/* 01 / Scope */}
              <section className={styles.section} id="scope">
                <div className={styles.sectionLabel}>01 / Scope</div>
                <h2>What the current build does</h2>
                <p className={styles.sectionIntro}>
                  The application is a server-backed knowledge graph for ASP Private Capital. Humans inspect and upload.
                  Agents retrieve and change graph records.
                </p>
                <div className={styles.split}>
                  <div className={styles.callout}>
                    <h3>Implemented</h3>
                    <ul>{scope.provides.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                  <div className={styles.callout}>
                    <h3>Not implemented</h3>
                    <ul>{scope.excludes.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </div>
              </section>

              {/* 02 / Run locally */}
              <section className={styles.section} id="start">
                <div className={styles.sectionLabel}>02 / Run locally</div>
                <h2>Install, build, and start</h2>
                <p className={styles.sectionIntro}>
                  Run these commands from the <code className={styles.inlineCode}>knowledge-network</code> directory.
                </p>
                <pre className={styles.codeBlock}><code>{`npm install
npm run build
npm start

# open http://localhost:3000
# docs: http://localhost:3000/extension`}</code></pre>
                <p className={styles.notice}>
                  Stop the server with <code className={styles.inlineCode}>Ctrl+C</code>.
                  The production server reads and writes local data, so its host needs persistent writable storage.
                </p>
              </section>

              {/* 03 / Workspace map */}
              <section className={styles.section} id="workspace">
                <div className={styles.sectionLabel}>03 / Workspace map</div>
                <h2>Use the shortest route to the required data</h2>
                <ReferenceTable
                  headings={["Location", "Primary user", "Purpose"]}
                  rows={extensionDocs.workspace.map(({ path, owner, purpose }) => [path, owner, purpose])}
                />
              </section>

              {/* 04 / Section & Feature Catalog */}
              <section className={styles.section} id="taxonomy">
                <div className={styles.sectionLabel}>04 / Section & Feature Catalog</div>
                <h2>Standardized Section IDs, Feature Labels &amp; Instructional Tags</h2>
                <p className={styles.sectionIntro}>
                  Every workspace section and platform feature is cataloged with standardized identifiers,
                  component paths, Astryx CLI template origins, and instructional prompt tags for prompt-based workflows.
                </p>
                <div style={{ marginBottom: "20px" }}>
                  <Link href="/?view=catalog" className={styles.backLink}>
                    Open Interactive System Catalog Dashboard
                    <ArrowUpRight size={14} />
                  </Link>
                </div>

                <h3>Platform Sections</h3>
                <ReferenceTable
                  headings={["Section ID", "Title", "Route", "Owner", "Primary Component", "Instructional Tags"]}
                  rows={extensionDocs.taxonomy.sections}
                />

                <h3 style={{ marginTop: "24px" }}>Features &amp; Component Registry</h3>
                <ReferenceTable
                  headings={["Feature ID", "Feature Name", "Section", "Component Path", "Status", "Instructional Tags"]}
                  rows={extensionDocs.taxonomy.features}
                />

                <h3 style={{ marginTop: "24px" }}>Astryx CLI Template Mappings</h3>
                <ReferenceTable
                  headings={["Template Name", "Feature ID", "Live Path", "CLI Command"]}
                  rows={extensionDocs.taxonomy.templates}
                />

                <h3 style={{ marginTop: "24px" }}>Instructional Prompt Reference Guide</h3>
                <ReferenceTable
                  headings={["Syntax Format", "Target & Purpose", "Instruction Example"]}
                  rows={extensionDocs.taxonomy.syntaxGuide}
                />
              </section>

              {/* 05 / Human workflow */}
              <section className={styles.section} id="human-workflow">
                <div className={styles.sectionLabel}>05 / Human workflow</div>
                <h2>Inspect and upload</h2>
                <ol className={styles.steps}>
                  {extensionDocs.humanWorkflow.map((body) => (
                    <li key={body}><div><p>{body}</p></div></li>
                  ))}
                </ol>
              </section>

              {/* 06 / Agent workflow */}
              <section className={styles.section} id="agent-workflow">
                <div className={styles.sectionLabel}>06 / Agent workflow</div>
                <h2>Retrieve first, then write with provenance</h2>
                <p className={styles.sectionIntro}>
                  Start the stdio server with <code className={styles.inlineCode}>npm --silent run mcp</code>.
                  Use MCP before scanning repository files for knowledge.
                </p>
                <ol className={styles.steps}>
                  {extensionDocs.agentWorkflow.map(({ title, body }) => (
                    <li key={title}><div><strong>{title}</strong><p>{body}</p></div></li>
                  ))}
                </ol>
              </section>

              {/* 07 / MCP tools */}
              <section className={styles.section} id="mcp">
                <div className={styles.sectionLabel}>07 / MCP tools</div>
                <h2>Read tools</h2>
                <ReferenceTable headings={["Tool", "Result", "Inputs"]} rows={extensionDocs.mcpTools.read} />
                <h2>Write tools</h2>
                <ReferenceTable headings={["Tool", "Action", "Inputs"]} rows={extensionDocs.mcpTools.write} />
              </section>

              {/* 08 / HTTP API */}
              <section className={styles.section} id="http">
                <div className={styles.sectionLabel}>08 / HTTP API</div>
                <h2>Server routes</h2>
                <p className={styles.sectionIntro}>
                  GET routes are open on the deployed instance. Graph writes require
                  <code className={styles.inlineCode}> AGENT_WRITE_TOKEN</code> through
                  <code className={styles.inlineCode}> x-agent-token</code> or a Bearer token.
                  If the variable is unset, HTTP graph mutation returns 403.
                </p>
                <ReferenceTable headings={["Method", "Route", "Result"]} rows={extensionDocs.httpRoutes} />
              </section>

              {/* 09 / Graph model */}
              <section className={styles.section} id="model">
                <div className={styles.sectionLabel}>09 / Graph model</div>
                <h2>Allowed record values</h2>
                <div className={styles.modelGroup}><h3>Node types</h3><Tags values={extensionDocs.model.nodeTypes} /></div>
                <div className={styles.modelGroup}><h3>Status</h3><Tags values={extensionDocs.model.statuses} /></div>
                <div className={styles.modelGroup}><h3>Authority</h3><Tags values={extensionDocs.model.authority} /></div>
                <div className={styles.modelGroup}><h3>Link types</h3><Tags values={extensionDocs.model.linkTypes} /></div>
              </section>

              {/* 10 / Storage and configuration */}
              <section className={styles.section} id="storage">
                <div className={styles.sectionLabel}>10 / Storage and configuration</div>
                <h2>Runtime variables</h2>
                <ReferenceTable headings={["Variable", "Default", "Effect"]} rows={extensionDocs.configuration} />
                <p className={styles.notice}>
                  Source documents are immutable through graph operations. Node removal is recoverable.
                  Attached active links are soft-deleted with the node.
                </p>
              </section>

              {/* 11 / Repository map */}
              <section className={styles.section} id="repository">
                <div className={styles.sectionLabel}>11 / Repository map</div>
                <h2>Files to inspect when changing the build</h2>
                <ReferenceTable headings={["Location", "Responsibility"]} rows={extensionDocs.repository} />
              </section>

              {/* 12 / Commands */}
              <section className={styles.section} id="commands">
                <div className={styles.sectionLabel}>12 / Commands</div>
                <h2>Development and verification</h2>
                <ReferenceTable headings={["Command", "Result"]} rows={extensionDocs.commands} />
              </section>

              {/* 13 / Update this page */}
              <section className={styles.section} id="maintenance">
                <div className={styles.sectionLabel}>13 / Update this page</div>
                <h2>Keep implementation and documentation in the same change</h2>
                <p className={styles.sectionIntro}>
                  Edit <code className={styles.inlineCode}>src/content/extension-docs.ts</code> when a tool,
                  route, command, storage path, accepted format, workflow, or graph enum changes.
                  Edit this page component only when the documentation layout changes.
                </p>
                <p className={styles.notice}>
                  Before committing, compare this page against <code className={styles.inlineCode}>mcp/server.ts</code>,
                  <code className={styles.inlineCode}>src/app/api/</code>,
                  <code className={styles.inlineCode}>src/lib/graph/types.ts</code>, and
                  <code className={styles.inlineCode}>package.json</code>. Then run
                  <code className={styles.inlineCode}> npm test</code> and
                  <code className={styles.inlineCode}> npm run build</code>.
                </p>
                <Link href="/" className={styles.backLink}>
                  Open the Knowledge Bank
                  <ArrowUpRight size={14} />
                </Link>
              </section>
            </main>
          </div>
        </div>
      </AppShell>

      <CompanyProfileOverlay isOpen={companyProfileOpen} onOpenChange={setCompanyProfileOpen} />
      <Dialog isOpen={themeSettingsOpen} onOpenChange={setThemeSettingsOpen} purpose="info" width={400}>
        <DialogHeader
          onOpenChange={setThemeSettingsOpen}
          startContent={<Settings size={18} />}
          subtitle="Workspace appearance"
          title="Display settings"
        />
        <ThemePreferenceControl />
      </Dialog>
      <CommandPalette />
    </div>
  );
}
