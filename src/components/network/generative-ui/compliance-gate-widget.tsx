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
  ShieldCheckIcon,
  ShieldExclamationIcon,
  ArrowPathIcon,
  DocumentMagnifyingGlassIcon,
  FingerPrintIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { ComplianceGateData } from './types';
import { useGraphStore } from '@/lib/graph/store';

export function ComplianceGateWidget({ data }: { data: ComplianceGateData }) {
  const [rechecking, setRechecking] = useState(false);
  const [auditData, setAuditData] = useState(data);
  const setViewMode = useGraphStore((state) => state.setViewMode);

  const handleRecheck = async () => {
    setRechecking(true);
    await new Promise((r) => setTimeout(r, 750));
    setAuditData({
      ...auditData,
      evaluatedAt: new Date().toISOString(),
    });
    setRechecking(false);
  };

  const handleViewSources = () => {
    setViewMode('sources');
  };

  const isPassed = auditData.overallStatus === 'passed';

  return (
    <Card
      variant="default"
      padding={5}
      style={{
        borderRadius: 'var(--panel-radius, 8px)',
        border: `1px solid ${
          isPassed
            ? 'color-mix(in srgb, #10b981 30%, var(--border))'
            : 'color-mix(in srgb, #f59e0b 35%, var(--border))'
        }`,
        background: 'color-mix(in srgb, var(--card) 96%, var(--muted) 4%)',
        boxShadow: '0 4px 20px -2px rgba(0,0,0,0.06)',
      }}
    >
      <VStack gap={4}>
        {/* Header */}
        <HStack justify="between" vAlign="center" wrap="wrap" gap={3}>
          <HStack gap={2} vAlign="center">
            <Icon
              icon={isPassed ? ShieldCheckIcon : ShieldExclamationIcon}
              size="md"
              color={isPassed ? 'accent' : 'warning'}
            />
            <VStack gap={0}>
              <Text size="xsm" color="secondary" weight="semibold">
                Autonomous Compliance Gatekeeper • Statutory Verification
              </Text>
              <Heading level={3} style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                {auditData.targetEntity}
              </Heading>
            </VStack>
          </HStack>

          <HStack gap={2} vAlign="center">
            <Badge
              variant={isPassed ? 'success' : auditData.overallStatus === 'hold' ? 'error' : 'warning'}
              label={isPassed ? 'Statutory Perimeter: Clear' : 'Compliance Hold'}
              icon={<Icon icon={isPassed ? CheckCircleIcon : ExclamationTriangleIcon} size="sm" />}
            />
          </HStack>
        </HStack>

        {/* Audit Checklist Table */}
        <VStack gap={2}>
          {auditData.checks.map((check) => {
            const checkPassed = check.status === 'passed';
            return (
              <div
                key={check.id}
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <HStack justify="between" vAlign="center">
                  <HStack gap={2} vAlign="center">
                    <StatusDot
                      variant={checkPassed ? 'success' : check.status === 'hold' ? 'error' : 'warning'}
                      label={check.status}
                    />
                    <Text size="sm" weight="semibold">
                      {check.regulation}
                    </Text>
                    <Text size="xsm" color="secondary">
                      ({check.statutoryArticle})
                    </Text>
                  </HStack>

                  <Badge
                    variant={checkPassed ? 'green' : check.status === 'hold' ? 'red' : 'yellow'}
                    label={checkPassed ? 'Verified' : check.status.toUpperCase()}
                  />
                </HStack>

                <Text size="xsm" color="secondary" style={{ paddingLeft: '16px' }}>
                  {check.detail}
                </Text>

                <HStack gap={1} vAlign="center" style={{ paddingLeft: '16px', opacity: 0.7 }}>
                  <Icon icon={FingerPrintIcon} size="xsm" color="secondary" />
                  <Text size="xsm" color="secondary" style={{ fontFamily: 'var(--font-mono)' }}>
                    SHA-256: {check.fingerprint}
                  </Text>
                </HStack>
              </div>
            );
          })}
        </VStack>

        {/* Cryptographic Hash & Timestamp Footer */}
        <HStack justify="between" vAlign="center" wrap="wrap" gap={2} style={{ paddingTop: '4px', borderTop: '1px solid var(--border)' }}>
          <HStack gap={2} vAlign="center">
            <Icon icon={FingerPrintIcon} size="sm" color="secondary" />
            <Text size="xsm" color="secondary" style={{ fontFamily: 'var(--font-mono)' }}>
              Gate Digest: {auditData.statutoryHash}
            </Text>
          </HStack>

          <HStack gap={2}>
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon icon={ArrowPathIcon} size="sm" />}
              label={rechecking ? 'Re-evaluating...' : 'Re-run Gate'}
              onClick={handleRecheck}
              isDisabled={rechecking}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon={DocumentMagnifyingGlassIcon} size="sm" />}
              label="Inspect Regulatory Sources"
              onClick={handleViewSources}
            />
          </HStack>
        </HStack>
      </VStack>
    </Card>
  );
}

export default ComplianceGateWidget;
