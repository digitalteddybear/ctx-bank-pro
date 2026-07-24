import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import packageJson from "../../../package.json";
import { extensionDocs } from "@/content/extension-docs";
import { ExtensionNav } from "./extension-nav";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Extension documentation · World Creators",
  description:
    "Operating documentation for the World Creators Knowledge Network, its agent tools, APIs, storage, and workspace.",
};

type Row = readonly string[];

function WorldCreatorsMark() {
  return (
    <span className={styles.mark} aria-hidden="true">
      <svg viewBox="0 0 42 24">
        <path
          d="M2 13.8 10.1 5.7c1.5-1.5 3.9-1.5 5.4 0l4 4 6.1-6.1c1.5-1.5 3.9-1.5 5.4 0l1.4 1.4-10.2 10.2c-1.5 1.5-3.9 1.5-5.4 0l-4-4-5.4 5.4c-1.5 1.5-3.9 1.5-5.4 0L2 13.8Z"
          fill="currentColor"
        />
        <path
          d="m40 10.2-8.1 8.1c-1.5 1.5-3.9 1.5-5.4 0l-1.4-1.4L35.3 6.7c1.5-1.5 3.9-1.5 5.4 0l.7.7L40 10.2Z"
          fill="currentColor"
          opacity=".58"
        />
      </svg>
    </span>
  );
}

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

export default function ExtensionDocsPage() {
  const { release, scope } = extensionDocs;
  const toolCount = extensionDocs.mcpTools.read.length + extensionDocs.mcpTools.write.length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/extension" className={styles.brand}>
          <WorldCreatorsMark />
          <span>World Creators</span>
          <span className={styles.brandDivider} />
          <span className={styles.brandMuted}>Extension docs</span>
        </Link>
        <div className={styles.headerActions}>
          <span className={styles.version}>app v{packageJson.version}</span>
          <Link href="/" className={styles.backLink}>
            <ArrowLeft size={14} />
            Open graph
          </Link>
        </div>
      </header>

      <div className={styles.layout}>
        <ExtensionNav />

        <main className={styles.main}>
          <section className={styles.hero}>
            <div className={styles.eyebrow}>Operator and agent documentation</div>
            <h1>Knowledge Network extension</h1>
            <p className={styles.lede}>
              Use this page to run the application, locate its source and data,
              process uploaded documents, and operate the knowledge graph through MCP or HTTP.
            </p>
            <div className={styles.facts}>
              <div className={styles.fact}><span>Reviewed</span><strong>{release.reviewedOn}</strong></div>
              <div className={styles.fact}><span>Graph schema</span><strong>{release.schemaVersion}</strong></div>
              <div className={styles.fact}><span>MCP tools</span><strong>{toolCount}</strong></div>
              <div className={styles.fact}><span>Persistence</span><strong>{release.storage}</strong></div>
              <div className={styles.fact}><span>Frontend sync</span><strong>{release.syncInterval}</strong></div>
            </div>
          </section>

          <section className={styles.section} id="scope">
            <div className={styles.sectionLabel}>01 / Scope</div>
            <h2>What the current build does</h2>
            <p className={styles.sectionIntro}>
              The application is a server-backed knowledge graph. Humans inspect and upload.
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

          <section className={styles.section} id="workspace">
            <div className={styles.sectionLabel}>03 / Workspace map</div>
            <h2>Use the shortest route to the required data</h2>
            <ReferenceTable
              headings={["Location", "Primary user", "Purpose"]}
              rows={extensionDocs.workspace.map(({ path, owner, purpose }) => [path, owner, purpose])}
            />
          </section>

          <section className={styles.section} id="human-workflow">
            <div className={styles.sectionLabel}>04 / Human workflow</div>
            <h2>Inspect and upload</h2>
            <ol className={styles.steps}>
              {extensionDocs.humanWorkflow.map((body) => (
                <li key={body}><div><p>{body}</p></div></li>
              ))}
            </ol>
          </section>

          <section className={styles.section} id="agent-workflow">
            <div className={styles.sectionLabel}>05 / Agent workflow</div>
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

          <section className={styles.section} id="mcp">
            <div className={styles.sectionLabel}>06 / MCP tools</div>
            <h2>Read tools</h2>
            <ReferenceTable headings={["Tool", "Result", "Inputs"]} rows={extensionDocs.mcpTools.read} />
            <h2>Write tools</h2>
            <ReferenceTable headings={["Tool", "Action", "Inputs"]} rows={extensionDocs.mcpTools.write} />
          </section>

          <section className={styles.section} id="http">
            <div className={styles.sectionLabel}>07 / HTTP API</div>
            <h2>Server routes</h2>
            <p className={styles.sectionIntro}>
              GET routes are open on the deployed instance. Graph writes require
              <code className={styles.inlineCode}> AGENT_WRITE_TOKEN</code> through
              <code className={styles.inlineCode}> x-agent-token</code> or a Bearer token.
              If the variable is unset, HTTP graph mutation returns 403.
            </p>
            <ReferenceTable headings={["Method", "Route", "Result"]} rows={extensionDocs.httpRoutes} />
          </section>

          <section className={styles.section} id="model">
            <div className={styles.sectionLabel}>08 / Graph model</div>
            <h2>Allowed record values</h2>
            <div className={styles.modelGroup}><h3>Node types</h3><Tags values={extensionDocs.model.nodeTypes} /></div>
            <div className={styles.modelGroup}><h3>Status</h3><Tags values={extensionDocs.model.statuses} /></div>
            <div className={styles.modelGroup}><h3>Authority</h3><Tags values={extensionDocs.model.authority} /></div>
            <div className={styles.modelGroup}><h3>Link types</h3><Tags values={extensionDocs.model.linkTypes} /></div>
          </section>

          <section className={styles.section} id="storage">
            <div className={styles.sectionLabel}>09 / Storage and configuration</div>
            <h2>Runtime variables</h2>
            <ReferenceTable headings={["Variable", "Default", "Effect"]} rows={extensionDocs.configuration} />
            <p className={styles.notice}>
              Source documents are immutable through graph operations. Node removal is recoverable.
              Attached active links are soft-deleted with the node.
            </p>
          </section>

          <section className={styles.section} id="repository">
            <div className={styles.sectionLabel}>10 / Repository map</div>
            <h2>Files to inspect when changing the build</h2>
            <ReferenceTable headings={["Location", "Responsibility"]} rows={extensionDocs.repository} />
          </section>

          <section className={styles.section} id="commands">
            <div className={styles.sectionLabel}>11 / Commands</div>
            <h2>Development and verification</h2>
            <ReferenceTable headings={["Command", "Result"]} rows={extensionDocs.commands} />
          </section>

          <section className={styles.section} id="maintenance">
            <div className={styles.sectionLabel}>12 / Update this page</div>
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
              Open the knowledge graph
              <ArrowUpRight size={14} />
            </Link>
          </section>
        </main>
      </div>
    </div>
  );
}
