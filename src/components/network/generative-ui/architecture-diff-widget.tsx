// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import { useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import {
  CodeBracketIcon,
  CheckIcon,
  ArrowsPointingOutIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import type { ArchitectureDiffData } from './types';
import { useGraphStore } from '@/lib/graph/store';
import { requestBackendSync } from '@/lib/backend-sync';

export function ArchitectureDiffWidget({ data }: { data: ArchitectureDiffData }) {
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const setViewMode = useGraphStore((state) => state.setViewMode);

  const handleOpenIDE = () => {
    if (data.fileId?.startsWith('app-editor/')) {
      window.location.assign(`/ide?file=${encodeURIComponent(data.filePath)}`);
      return;
    }
    setViewMode('architecture');
  };

  const handleSaveDraft = async () => {
    if (!data.fileId || data.proposedContent === undefined || !data.baseHash) {
      setSaveError('This preview has no complete draft payload.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const isAppEditorDraft = data.fileId.startsWith('app-editor/');
      const response = await fetch(isAppEditorDraft ? '/api/ai-workspace/app-drafts' : '/api/architecture', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(isAppEditorDraft
          ? { path: data.filePath, content: data.proposedContent, baseHash: data.baseHash, revision: data.revision ?? null }
          : { id: data.fileId, content: data.proposedContent, baseHash: data.baseHash, revision: data.revision ?? null }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Unable to save the draft.');
      setSaved(true);
      requestBackendSync();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save the draft.');
    } finally {
      setSaving(false);
    }
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
      <VStack gap={3}>
        {/* Header */}
        <HStack justify="between" vAlign="center" wrap="wrap" gap={2}>
          <HStack gap={2} vAlign="center">
            <Icon icon={CodeBracketIcon} size="md" color="accent" />
            <VStack gap={1}>
              <Text size="xsm" color="secondary" weight="semibold">
                Architecture Draft Revision • Repository Sync
              </Text>
              <Heading level={3} style={{ margin: 0, fontSize: '15px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                {data.filePath}
              </Heading>
            </VStack>
          </HStack>

          <HStack gap={2} vAlign="center">
            <Badge variant="blue" label={data.language} />
            {data.targetCommitHash && (
              <Badge variant="neutral" label={`ref:${data.targetCommitHash.slice(0, 7)}`} />
            )}
          </HStack>
        </HStack>

        <Text size="sm" color="secondary">
          {data.summary}
        </Text>
        {saveError && <Text role="alert">{saveError}</Text>}
        {saved && <Text role="status">Draft saved for review. Source files are unchanged.</Text>}

        {/* Diff Container */}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            lineHeight: '1.5',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'color-mix(in srgb, var(--secondary) 30%, var(--card))',
            overflowX: 'auto',
            padding: '8px 0',
          }}
        >
          {data.diffLines.map((line, idx) => {
            const isAdded = line.type === 'added';
            const isRemoved = line.type === 'removed';
            const bg = isAdded
              ? 'rgba(16, 185, 129, 0.12)'
              : isRemoved
              ? 'rgba(239, 68, 68, 0.12)'
              : 'transparent';
            const color = isAdded
              ? '#10b981'
              : isRemoved
              ? '#ef4444'
              : 'var(--text-secondary)';
            const prefix = isAdded ? '+ ' : isRemoved ? '- ' : '  ';

            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px 12px',
                  backgroundColor: bg,
                  color,
                  whiteSpace: 'pre',
                }}
              >
                <span
                  style={{
                    width: '32px',
                    userSelect: 'none',
                    opacity: 0.4,
                    display: 'inline-block',
                    textAlign: 'right',
                    marginRight: '12px',
                  }}
                >
                  {line.lineNumber ?? idx + 1}
                </span>
                <span>{prefix}{line.content}</span>
              </div>
            );
          })}
        </div>

        {/* Actions Bar */}
        <HStack justify="between" vAlign="center" wrap="wrap" gap={2} style={{ paddingTop: '4px', borderTop: '1px solid var(--border)' }}>
          <Text size="xsm" color="secondary">
            Editable in full IDE overlay or inline diff view
          </Text>

          <HStack gap={2}>
            <Button
              variant="primary"
              size="sm"
              icon={<Icon icon={ArrowsPointingOutIcon} size="sm" />}
              label={data.fileId?.startsWith('app-editor/') ? 'Open App Editor' : 'Open Architecture'}
              onClick={handleOpenIDE}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon icon={saved ? CheckIcon : DocumentDuplicateIcon} size="sm" />}
              label={saved ? 'Draft Saved' : 'Save Draft'}
              isDisabled={saving}
              onClick={() => void handleSaveDraft()}
            />
          </HStack>
        </HStack>
      </VStack>
    </Card>
  );
}

export default ArchitectureDiffWidget;
