"use client";

import dynamic from "next/dynamic";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import type { OrbState } from "thinking-orbs";
import type { Stage, Status } from "@/lib/server/outreach/types";

const ThinkingOrb = dynamic(
  () => import("thinking-orbs").then((module) => module.ThinkingOrb),
  { ssr: false, loading: () => <StatusDot variant="neutral" label="Loading indicator" /> },
);

const stages: Record<Stage, { state: OrbState; label: string }> = {
  prospect: { state: "searching", label: "Researching prospect" },
  outreach: { state: "composing", label: "Drafting message" },
  conversation: { state: "solving", label: "Reviewing reply" },
  deliverability: { state: "connecting", label: "Checking inbox readiness" },
  compliance: { state: "solving", label: "Reviewing compliance" },
  dispatch: { state: "connecting", label: "Processing dispatch" },
};

const labels: Record<Status, string> = {
  queued: "Queued", running: "Working", awaiting_approval: "Awaiting approval",
  waiting_reply: "Waiting for reply", booking_pending: "Booking pending",
  booked: "Booked", held: "On hold", escalated: "Needs human review",
  suppressed: "Suppressed", paused: "Paused", failed: "Failed",
};

/** Feed persisted run state; waiting and stopped runs never imply active work. */
export function AgentStateOrb({ status, stage, staticOnly = false }: {
  status: Status;
  stage: Stage;
  staticOnly?: boolean;
}) {
  const active = status === "running";
  const label = active ? stages[stage].label : labels[status];
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      {staticOnly || !active ? (
        <StatusDot label={label} variant={status === "failed" ? "error" : status === "booked" ? "success" : "neutral"} />
      ) : (
        <ThinkingOrb state={stages[stage].state} size={20} theme="auto" gravity={false} aria-hidden="true" />
      )}
      <Text>{label}</Text>
    </HStack>
  );
}
