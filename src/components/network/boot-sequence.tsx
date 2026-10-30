"use client";

import { motion } from "motion/react";
import Image from "next/image";

export function BootSequence({ progress }: { progress: number }) {
  return (
    <motion.div
      className="boot-sequence"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="status"
      aria-label="Loading ASP Private Capital"
      aria-live="polite"
    >
      <Image
        className="boot-logo"
        src="/assets/CTXBANK.svg"
        alt=""
        aria-hidden="true"
        width={288}
        height={42}
        priority
      />
      <div className="boot-progress" aria-hidden="true">
        <motion.span animate={{ width: `${Math.max(4, progress * 100)}%` }} />
      </div>
    </motion.div>
  );
}
