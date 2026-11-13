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
  ShareIcon,
  ArrowTopRightOnSquareIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline';
import type { NeuralSubGraphData } from './types';
import { useGraphStore } from '@/lib/graph/store';

export function NeuralSubGraphWidget({ data }: { data: NeuralSubGraphData }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>(data.rootNodeId);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const selectNode = useGraphStore((state) => state.selectNode);

  const selectedNode = data.nodes.find((n) => n.id === selectedNodeId) ?? data.nodes[0];

  const handleOpenGraph = () => {
    setViewMode('network');
    if (selectedNodeId) {
      selectNode(selectedNodeId);
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
      <VStack gap={4}>
        {/* Header */}
        <HStack justify="between" vAlign="center" wrap="wrap" gap={2}>
          <HStack gap={2} vAlign="center">
            <Icon icon={ShareIcon} size="md" color="accent" />
            <VStack gap={0}>
              <Text size="xsm" color="secondary" weight="semibold">
                Neural Sub-Graph Explorer • Vector Traversal
              </Text>
              <Heading level={3} style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                {data.query}
              </Heading>
            </VStack>
          </HStack>

          <HStack gap={2} vAlign="center">
            <Badge variant="blue" label={`${data.nodes.length} Nodes`} />
            <Badge variant="purple" label={`${data.edges.length} Relations`} />
          </HStack>
        </HStack>

        <Text size="sm" color="secondary">
          {data.summary}
        </Text>

        {/* Visual Graph Nodes Interactive Area */}
        <div
          style={{
            padding: '14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'color-mix(in srgb, var(--secondary) 25%, var(--card))',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <HStack gap={2} wrap="wrap">
            {data.nodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              const typeColor =
                node.type === 'lead'
                  ? 'var(--primary)'
                  : node.type === 'organization'
                  ? '#8b5cf6'
                  : node.type === 'regulation'
                  ? '#10b981'
                  : '#f59e0b';

              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedNodeId(node.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--card)' : 'transparent',
                    border: `1px solid ${isSelected ? typeColor : 'var(--border)'}`,
                    boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: typeColor,
                    }}
                  />
                  <Text size="sm" weight={isSelected ? 'semibold' : 'normal'}>
                    {node.label}
                  </Text>
                  {node.confidence && (
                    <Text size="xsm" color="secondary">
                      {Math.round(node.confidence * 100)}%
                    </Text>
                  )}
                </button>
              );
            })}
          </HStack>

          {/* Active Node Details & Traversal Edges */}
          {selectedNode && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
              }}
            >
              <HStack justify="between" vAlign="center">
                <HStack gap={2} vAlign="center">
                  <Icon icon={CircleStackIcon} size="sm" color="accent" />
                  <Text size="sm" weight="semibold">
                    Focused Entity: {selectedNode.label}
                  </Text>
                  <Badge variant="neutral" label={selectedNode.type.toUpperCase()} />
                </HStack>

                <Text size="xsm" color="secondary">
                  Node ID: {selectedNode.id}
                </Text>
              </HStack>

              {/* Related Traversal Edges */}
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {data.edges
                  .filter((e) => e.from === selectedNode.id || e.to === selectedNode.id)
                  .map((edge, idx) => (
                    <div
                      key={idx}
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: 'color-mix(in srgb, var(--secondary) 40%, transparent)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {edge.from === selectedNode.id ? '↳ ' : '↲ '}
                      <span style={{ fontWeight: 600 }}>{edge.relation}</span>{' '}
                      {edge.from === selectedNode.id ? edge.to : edge.from}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        <HStack justify="end" vAlign="center">
          <Button
            variant="primary"
            size="sm"
            icon={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" />}
            label="Open in 3D Knowledge Bank"
            onClick={handleOpenGraph}
          />
        </HStack>
      </VStack>
    </Card>
  );
}

export default NeuralSubGraphWidget;
