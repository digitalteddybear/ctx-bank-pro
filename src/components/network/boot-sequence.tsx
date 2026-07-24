"use client";

import { motion } from "motion/react";

const steps = ["Loading application", "Loading graph data", "Starting graph renderer"];

export function BootSequence({ progress }: { progress: number }) {
  const index = Math.min(steps.length - 1, Math.floor(progress * steps.length));

  return (
    <motion.div
      className="boot-sequence"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="status"
      aria-live="polite"
    >
      <div className="boot-orbit" aria-hidden="true">
        <span className="boot-orbit__core" />
        <span className="boot-orbit__ring boot-orbit__ring--one" />
        <span className="boot-orbit__ring boot-orbit__ring--two" />
        <span className="boot-orbit__node boot-orbit__node--one" />
        <span className="boot-orbit__node boot-orbit__node--two" />
        <span className="boot-orbit__node boot-orbit__node--three" />
      </div>
      <div className="boot-copy">
        <div className="eyebrow">Application start</div>
        <h1>World Creators Knowledge Bank</h1>
        <p>{steps[index]}</p>
        <div className="boot-progress">
          <motion.span animate={{ width: `${Math.max(8, progress * 100)}%` }} />
        </div>
        <span className="boot-progress__value">{Math.round(progress * 100)}%</span>
      </div>
    </motion.div>
  );
}
