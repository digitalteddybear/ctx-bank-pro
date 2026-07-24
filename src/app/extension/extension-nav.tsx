"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

export const extensionSections = [
  ["scope", "Scope"],
  ["start", "Run locally"],
  ["workspace", "Workspace map"],
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

type SectionId = (typeof extensionSections)[number][0];

export function ExtensionNav() {
  const [activeSection, setActiveSection] = useState<SectionId>(extensionSections[0][0]);

  useEffect(() => {
    let animationFrame = 0;

    const updateActiveSection = () => {
      let current: SectionId = extensionSections[0][0];
      for (const [id] of extensionSections) {
        const section = document.getElementById(id);
        if (!section || section.getBoundingClientRect().top > 150) break;
        current = id;
      }
      setActiveSection(current);
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  return (
    <aside className={styles.nav}>
      <div className={styles.navLabel}>On this page</div>
      <nav aria-label="Documentation sections">
        <ol>
          {extensionSections.map(([id, label]) => {
            const active = activeSection === id;
            return (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className={active ? styles.navActive : undefined}
                  aria-current={active ? "location" : undefined}
                  onClick={() => setActiveSection(id)}
                >
                  {label}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}
