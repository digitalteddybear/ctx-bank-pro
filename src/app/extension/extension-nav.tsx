import { Outline } from "@astryxdesign/core/Outline";
import styles from "./page.module.css";

const extensionSections = [
  ["scope", "Scope"],
  ["start", "Run locally"],
  ["workspace", "Workspace map"],
  ["taxonomy", "Section & Feature Catalog"],
  ["human-workflow", "Human workflow"],
  ["agent-workflow", "Agent workflow"],
  ["mcp", "MCP tools"],
  ["http", "HTTP API"],
  ["model", "Graph model"],
  ["storage", "Storage and configuration"],
  ["repository", "Repository map"],
  ["commands", "Commands"],
  ["maintenance", "Update this page"],
] as const;

export function ExtensionNav() {
  return (
    <aside className={styles.nav}>
      <Outline
        density="compact"
        items={extensionSections.map(([id, label]) => ({ id, label, level: 2 as const }))}
        label="Documentation outline"
      />
    </aside>
  );
}
