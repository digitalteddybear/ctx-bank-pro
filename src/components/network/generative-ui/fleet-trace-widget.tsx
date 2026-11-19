// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import { Card } from '@astryxdesign/core/Card';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import {
  CpuChipIcon,
  ClockIcon,
  CheckCircleIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import type { FleetTraceData } from './types';
import { useGraphStore } from '@/lib/graph/store';

export function FleetTraceWidget({ data }: { data: FleetTraceData }) {
  const setViewMode = useGraphStore((state) => state.setViewMode);

  const handleOpenAgents = () => {
    setViewMode('agents');
  };

  return (
    <Card
      variant="default"
      padding={5}
      style={{
        borderRadius: 'var(--panel-radius, 8px)',
        border: '1px solid color-mix(in srgb, var(--primary) 25%, var(--border))',
        background: 'var(--card)',
        boxShadow: '0 4px 20px -2px rgba(0,0,0,0.06)',
      }}
    >
      <VStack gap={4}>
        {/* Header */}
        <HStack justify="between" vAlign="center" wrap="wrap" gap={2}>
          <HStack gap={2} vAlign="center">
            <Icon icon={CpuChipIcon} size="md" color="accent" />
            <VStack gap={1}>
              <Text size="xsm" color="secondary" weight="semibold">
                Sovereign Fleet Execution Trace • Asynchronous Message Bus
              </Text>
              <Heading level={3} style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                Trigger: {data.trigger}
              </Heading>
            </VStack>
          </HStack>

          <HStack gap={2} vAlign="center">
            <Badge
              variant="green"
              label={`Total Latency: ${data.totalLatencyMs}ms`}
              icon={<Icon icon={ClockIcon} size="xsm" />}
            />
            <Badge variant="blue" label={`Dispatch ID: ${data.dispatchId.slice(0, 8)}`} />
          </HStack>
        </HStack>

        {/* Step-by-step pipeline */}
        <VStack gap={2}>
          {data.steps.map((step, idx) => {
            const isCompleted = step.status === 'completed';
            return (
              <div
                key={step.agentId}
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'color-mix(in srgb, var(--secondary) 25%, var(--card))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <HStack gap={3} vAlign="center">
                  <span
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: 'color-mix(in srgb, var(--primary) 20%, transparent)',
                      color: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    {idx + 1}
                  </span>

                  <VStack gap={1}>
                    <HStack gap={2} vAlign="center">
                      <Text size="sm" weight="semibold">
                        {step.agentName}
                      </Text>
                      <Text size="xsm" color="secondary">
                        ({step.role})
                      </Text>
                    </HStack>
                    <Text size="xsm" color="secondary">
                      {step.summary}
                    </Text>
                  </VStack>
                </HStack>

                <HStack gap={2} vAlign="center">
                  <Text size="xsm" color="secondary" style={{ fontFamily: 'var(--font-mono)' }}>
                    {step.latencyMs}ms
                  </Text>
                  <StatusDot
                    variant={isCompleted ? 'success' : 'neutral'}
                    label={step.status}
                  />
                  {isCompleted && (
                    <Icon icon={CheckCircleIcon} size="sm" color="accent" />
                  )}
                </HStack>
              </div>
            );
          })}
        </VStack>

        {/* Footer Actions */}
        <HStack justify="between" vAlign="center" wrap="wrap" gap={2} style={{ paddingTop: '4px', borderTop: '1px solid var(--border)' }}>
          <Text size="xsm" color="secondary">
            Fine-tuned sovereign agents operating under statutory perimeters
          </Text>

          <Button
            variant="ghost"
            size="sm"
            icon={<Icon icon={UsersIcon} size="sm" />}
            label="View Sovereign Agent Profiles"
            onClick={handleOpenAgents}
          />
        </HStack>
      </VStack>
    </Card>
  );
}

export default FleetTraceWidget;
