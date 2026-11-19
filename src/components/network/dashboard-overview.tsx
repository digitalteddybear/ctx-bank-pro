"use client";

import type { Activity } from "lucide-react";
import { Building2 } from "lucide-react";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Text";

export function CompanyProfileOverlay({
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

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
  onClick,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  accent: string;
  onClick: () => void;
}) {
  return (
    <ClickableCard
      className="panel metric-card"
      label={`${label}: ${value}. ${detail}`}
      onClick={onClick}
      padding={4}
    >
      <div className="metric-card__top">
        <span className="metric-card__label">{label}</span>
        <span className="metric-card__icon" style={{ color: accent }}>
          <Icon size={16} />
        </span>
      </div>
      <Heading level={2}>{value}</Heading>
      <span className="metric-card__detail">
        <span style={{ backgroundColor: accent }} />
        {detail}
      </span>
    </ClickableCard>
  );
}
