// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import { useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import {
  CheckBadgeIcon,
  ShieldCheckIcon,
  DocumentArrowDownIcon,
  PaperAirplaneIcon,
  EyeIcon,
  BuildingOffice2Icon,
  MapPinIcon,
  CurrencyDollarIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { LeadQualificationData } from './types';
import { useGraphStore } from '@/lib/graph/store';

export function LeadQualificationWidget({ data }: { data: LeadQualificationData }) {
  const [outreachStatus, setOutreachStatus] = useState<'idle' | 'drafting' | 'dispatched'>('idle');
  const [exported, setExported] = useState(false);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const selectNode = useGraphStore((state) => state.selectNode);

  const handleDraftOutreach = async () => {
    setOutreachStatus('drafting');
    try {
      // Simulate or call outreach dispatch
      await new Promise((r) => setTimeout(r, 800));
      setOutreachStatus('dispatched');
    } catch {
      setOutreachStatus('idle');
    }
  };

  const handleViewInGraph = () => {
    setViewMode('network');
    if (data.targetNodeId) {
      selectNode(data.targetNodeId);
    }
  };

  const handleExport = () => {
    setExported(true);
    navigator.clipboard?.writeText(JSON.stringify(data, null, 2));
    setTimeout(() => setExported(false), 2500);
  };

  const isHighConfidence = data.confidenceScore >= 90;

  return (
    <Card
      variant="default"
      padding={5}
      style={{
        borderRadius: 'var(--panel-radius, 8px)',
        border: '1px solid color-mix(in srgb, var(--primary) 25%, var(--border))',
        background: 'color-mix(in srgb, var(--card) 95%, var(--primary) 5%)',
        boxShadow: '0 4px 20px -2px rgba(0,0,0,0.06)',
      }}
    >
      <VStack gap={4}>
        {/* Header with Lead Profile & Confidence */}
        <HStack justify="between" vAlign="start" wrap="wrap" gap={3}>
          <VStack gap={1}>
            <HStack gap={2} vAlign="center">
              <Icon icon={SparklesIcon} size="sm" color="accent" />
              <Text size="sm" color="secondary" weight="semibold">
                Sovereign Lead Dossier • Prospect Intelligence
              </Text>
            </HStack>
            <Heading level={3} style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
              {data.name}
            </Heading>
            <HStack gap={3} vAlign="center" wrap="wrap" style={{ marginTop: '2px' }}>
              <HStack gap={1} vAlign="center">
                <Icon icon={BuildingOffice2Icon} size="xsm" color="secondary" />
                <Text size="sm" color="secondary">
                  {data.role} at {data.firm}
                </Text>
              </HStack>
              <HStack gap={1} vAlign="center">
                <Icon icon={MapPinIcon} size="xsm" color="secondary" />
                <Text size="xsm" color="secondary">
                  {data.location}
                </Text>
              </HStack>
              {data.aum && (
                <HStack gap={1} vAlign="center">
                  <Icon icon={CurrencyDollarIcon} size="xsm" color="secondary" />
                  <Text size="xsm" weight="semibold" color="secondary">
                    {data.aum}
                  </Text>
                </HStack>
              )}
            </HStack>
          </VStack>

          <HStack gap={2} vAlign="center">
            <Badge
              variant={isHighConfidence ? 'success' : 'blue'}
              label={`${data.confidenceScore}% Qualified`}
              icon={<Icon icon={CheckBadgeIcon} size="sm" />}
            />
            <Badge
              variant="neutral"
              label={data.classification}
            />
          </HStack>
        </HStack>

        {/* Statutory Basis & Hypothesis */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            background: 'color-mix(in srgb, var(--secondary) 50%, transparent)',
            borderLeft: '3px solid var(--primary)',
          }}
        >
          <HStack gap={2} vAlign="center" style={{ marginBottom: '4px' }}>
            <Icon icon={ShieldCheckIcon} size="sm" color="accent" />
            <Text size="sm" weight="semibold">
              Statutory Basis: {data.statutoryBasis}
            </Text>
          </HStack>
          <Text size="sm" color="secondary">
            {data.notes}
          </Text>
        </div>

        {/* Evidence Citations */}
        {data.citations.length > 0 && (
          <VStack gap={2}>
            <Text size="sm" weight="semibold" color="secondary">
              Verified Evidence & Grounding Citations:
            </Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
              {data.citations.map((cite) => (
                <div
                  key={cite.id}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <VStack gap={0}>
                    <Text size="sm" weight="medium">
                      {cite.title}
                    </Text>
                    <Text size="xsm" color="secondary">
                      {cite.source}
                    </Text>
                  </VStack>
                  <HStack gap={1} vAlign="center">
                    <StatusDot variant={cite.verified ? 'success' : 'neutral'} label={cite.verified ? 'Verified' : 'Unchecked'} />
                    <Text size="xsm" color={cite.verified ? 'primary' : 'secondary'}>
                      {cite.verified ? 'Verified' : 'Pending'}
                    </Text>
                  </HStack>
                </div>
              ))}
            </div>
          </VStack>
        )}

        {/* Actions Bar */}
        <HStack gap={3} justify="between" vAlign="center" wrap="wrap" style={{ paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
          <HStack gap={2}>
            <Button
              variant="primary"
              size="sm"
              icon={<Icon icon={PaperAirplaneIcon} size="sm" />}
              label={
                outreachStatus === 'dispatched'
                  ? 'Outreach Dispatched'
                  : outreachStatus === 'drafting'
                  ? 'Synthesizing Draft...'
                  : 'Draft Outreach'
              }
              onClick={handleDraftOutreach}
              isDisabled={outreachStatus !== 'idle'}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon icon={EyeIcon} size="sm" />}
              label="View in Knowledge Bank"
              onClick={handleViewInGraph}
            />
          </HStack>

          <Button
            variant="ghost"
            size="sm"
            icon={<Icon icon={DocumentArrowDownIcon} size="sm" />}
            label={exported ? 'Dossier Copied' : 'Export Dossier'}
            onClick={handleExport}
          />
        </HStack>
      </VStack>
    </Card>
  );
}

export default LeadQualificationWidget;
