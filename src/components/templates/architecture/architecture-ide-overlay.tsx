// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, useMemo, useEffect, type CSSProperties} from 'react';

import {Layout, LayoutContent, LayoutPanel} from '@astryxdesign/core/Layout';
import {ResizeHandle, useResizable} from '@astryxdesign/core/Resizable';
import {Text, Heading} from '@astryxdesign/core/Text';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Stack, StackItem} from '@astryxdesign/core/Layout';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Button} from '@astryxdesign/core/Button';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {List, ListItem} from '@astryxdesign/core/List';
import {TextInput} from '@astryxdesign/core/TextInput';
import {TreeList} from '@astryxdesign/core/TreeList';
import type {TreeListItemData} from '@astryxdesign/core/TreeList';
import {
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { X } from 'lucide-react';
import { useBackendRefresh } from '@/lib/backend-sync';
import { TextArea } from '@astryxdesign/core/TextArea';
import type { ArchitectureNode } from '@/lib/architecture/types';
import type { ArchitectureFile } from '@/lib/architecture/types';

const styles: Record<string, CSSProperties> = {
  contentFill: {
    height: '100%',
  },
  terminalWrapper: {
    minHeight: 0,
    overflow: 'hidden',
    display: 'grid',
  },
  tabListPadding: {
    paddingTop: 'var(--spacing-2)',
  },
  metadataCompact: {
    gap: 'var(--spacing-1) var(--spacing-3)',
  },
  historyTimelineDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: 'var(--color-border-emphasized)',
    marginTop: 6,
    flexShrink: 0,
  },
  editorArea: {
    overflow: 'auto',
    minHeight: 0,
  },
  fileExplorer: {
    padding: 16,
    minWidth: 0,
  },
  propertiesPanel: {
    height: '100%',
  },
  propertiesContent: {
    flex: 1,
    minHeight: 0,
  },
  propertyActions: {
    marginTop: 'auto',
  },
  terminalPanel: {
    flexShrink: 0,
    overflow: 'hidden',
  },
};

export interface ArchitectureIdeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  activeFileNode?: ArchitectureFile | null;
  nodes: ArchitectureNode[];
  onSelect: (node: ArchitectureNode) => void;
  content: string;
  onEdit: (value: string) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  canSave: boolean;
  feedback: string;
}

export function ArchitectureIdeOverlay({
  isOpen,
  onClose,
  activeFileNode, nodes, onSelect, content, onEdit, onSave, saving, canSave, feedback,
}: ArchitectureIdeOverlayProps) {
  const initialFileName = useMemo(() => {
    if (!activeFileNode?.path) return '';
    return activeFileNode.path.split('/').pop() || 'Counter.tsx';
  }, [activeFileNode]);

  const [activeFile, setActiveFile] = useState(initialFileName);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTermTab, setActiveTermTab] = useState('terminal');
  const [activePropertiesTab, setActivePropertiesTab] = useState('properties');
  const fileTree = useMemo(() => {
    const map = (items: ArchitectureNode[]): TreeListItemData[] => items.map(node => ({id:node.id, label:node.name, children:node.children ? map(node.children) : undefined, onClick:() => onSelect(node)}));
    return map(nodes);
  }, [nodes, onSelect]);
  const currentCode = content;
  const [terminal, setTerminal] = useState('Waiting for agent events…');
  useBackendRefresh(async () => {
    if (!isOpen) return;
    try {
      const response = await fetch('/api/agents', {cache:'no-store'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setTerminal(data.orchestrator.recentMessages.map((message: {timestamp:string; sender:string; messageType:string; payload:unknown}) => `${message.timestamp} ${message.sender} ${message.messageType} ${JSON.stringify(message.payload)}`).join('\n') || 'No agent events recorded.');
    } catch (error) { setTerminal((error as Error).message); }
  });

  const currentPath = activeFileNode?.path ?? 'Select a source file';

  const currentProperties = useMemo(() => {
    return [
      { label: 'Type', value: activeFile.endsWith('.tsx') ? 'React Component' : 'Source File' },
      { label: 'Language', value: activeFile.endsWith('.json') ? 'JSON' : activeFile.endsWith('.mjs') ? 'JavaScript' : 'TypeScript' },
      { label: 'Lines', value: String(currentCode.split('\n').length) },
      { label: 'Size', value: `${(currentCode.length / 1024).toFixed(1)} KB` },
      { label: 'State', value: activeFileNode?.draft ? 'Review draft' : 'Source' },

    ];
  }, [activeFile, currentCode]);

  const startPanel = useResizable({
    defaultSize: 256,
    minSizePx: 160,
    maxSizePx: 400,
    collapsible: true,
    collapsedSize: 50,
  });

  const endPanel = useResizable({
    defaultSize: 320,
    minSizePx: 180,
    maxSizePx: 500,
    collapsible: true,
    collapsedSize: 50,
  });

  const bottomPanel = useResizable({
    defaultSize: 300,
    minSizePx: 80,
    maxSizePx: Infinity,
    collapsible: true,
    collapsedSize: 40,
  });

  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    if (activeFileNode?.path) {
      const fileName = activeFileNode.path.split('/').pop();
      if (fileName) setActiveFile(fileName);
    }
  }, [activeFileNode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="architecture-ide-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "var(--background, #0a0a0c)",
        display: "flex",
        flexDirection: "column",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
      role="dialog"
      aria-label="IDE Workspace"
    >

      {/* Top Header matching Screenshot 2026-10-31 at 20.23.27.png */}
      <div
        style={{
          padding: "20px 24px 16px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          background: "var(--card, #121316)",
          flexShrink: 0,
        }}
      >
        <div style={{ maxWidth: "880px" }}>
          <Heading
            level={2}
            style={{
              fontSize: "20px",
              fontWeight: 700,
              margin: "0 0 6px 0",
              color: "var(--foreground, #ffffff)",
            }}
          >
            IDE
          </Heading>
          <Text
            color="secondary"
            style={{
              fontSize: "13px",
              lineHeight: "1.5",
              color: "var(--foreground-muted, #9ca3af)",
            }}
          >
            Dense multi-pane workspace of resizable, collapsible regions: a hierarchy tree on one flank, tabbed documents in the middle, a docked drawer along the bottom, an inspector opposite. Drag a divider to resize or collapse any of them.
          </Text>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close IDE"
          style={{
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid var(--border, rgba(255, 255, 255, 0.15))",
            borderRadius: "6px",
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--foreground, #ffffff)",
            cursor: "pointer",
            transition: "all 0.15s ease",
            flexShrink: 0,
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, width: "100%", overflow: "hidden" }}>
    <Layout
      height="fill"
      content={
        <LayoutContent padding={0}>
          <Layout
            height="fill"
            start={
              isMobile ? undefined : (
                <>
                  {!startPanel.isCollapsed && (
                    <LayoutPanel
                      width={startPanel.size}
                      hasDivider={false}
                      padding={0}>
                      <Stack
                        direction="vertical"
                        style={styles.fileExplorer}
                        gap={2}>
                        <TextInput
                          label="Search files"
                          isLabelHidden
                          value={searchQuery}
                          onChange={setSearchQuery}
                          placeholder="Search"
                          size="md"
                          startIcon={MagnifyingGlassIcon}
                        />
                        <TreeList items={fileTree} density="compact" />
                      </Stack>
                    </LayoutPanel>
                  )}
                  <ResizeHandle
                    direction="horizontal"
                    hasDivider
                    isAlwaysVisible={false}
                    resizable={startPanel.props}
                    label="Resize file explorer"
                  />
                </>
              )
            }
            content={
              <LayoutContent padding={0}>
                <Layout
                  height="fill"
                  content={
                    <LayoutContent padding={0}>
                      <Stack direction="vertical" style={styles.contentFill}>
                        <StackItem size="fill" style={styles.editorArea}>
                          <TextArea label="Source draft" value={currentCode} onChange={onEdit} rows={24} hasSpellCheck={false} isDisabled={saving || !activeFileNode} />
                          <Button label="Save draft" onClick={onSave} isDisabled={!canSave || saving} />
                          {feedback && <Text role="status">{feedback}</Text>}
                        </StackItem>
                        <ResizeHandle
                          direction="vertical"
                          hasDivider
                          isReversed
                          isAlwaysVisible={false}
                          resizable={bottomPanel.props}
                          label="Resize terminal"
                        />
                        {!bottomPanel.isCollapsed && (
                          <Stack
                            direction="vertical"
                            height={bottomPanel.size}
                            style={styles.terminalPanel}>
                            <TabList
                              value={activeTermTab}
                              onChange={val => setActiveTermTab(val)}
                              size="sm"
                              hasDivider={false}
                              style={styles.tabListPadding}>
                              <Tab label="Terminal" value="terminal" />
                              <Tab label="Problems" value="problems" />
                              <Tab label="Output" value="output" />
                              <Tab label="Debug" value="debug" />
                            </TabList>
                            <StackItem
                              size="fill"
                              style={styles.terminalWrapper}>
                              <CodeBlock
                                code={terminal}
                                language="bash"
                                container="section"
                                hasLanguageLabel={false}
                                hasCopyButton={false}
                                size="sm"
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  borderWidth: 0,
                                  borderRadius: 0,
                                }}
                              />
                            </StackItem>
                          </Stack>
                        )}
                      </Stack>
                    </LayoutContent>
                  }
                  end={
                    isMobile ? undefined : (
                      <>
                        <ResizeHandle
                          direction="horizontal"
                          hasDivider
                          isReversed
                          isAlwaysVisible={false}
                          resizable={endPanel.props}
                          label="Resize properties panel"
                        />
                        {!endPanel.isCollapsed && (
                          <LayoutPanel
                            width={endPanel.size}
                            hasDivider={false}
                            padding={4}>
                            <Stack
                              direction="vertical"
                              gap={3}
                              style={styles.propertiesPanel}>
                              <SegmentedControl
                                label="Properties panel sections"
                                value={activePropertiesTab}
                                onChange={setActivePropertiesTab}
                                size="sm"
                                layout="fill">
                                <SegmentedControlItem
                                  label="Properties"
                                  value="properties"
                                />
                                <SegmentedControlItem
                                  label="History"
                                  value="history"
                                />
                              </SegmentedControl>
                              {activePropertiesTab === 'properties' ? (
                                <Stack
                                  direction="vertical"
                                  gap={3}
                                  style={styles.propertiesContent}>
                                  <Stack direction="vertical" gap={1}>
                                    <Heading level={3} maxLines={1}>
                                      {activeFile}
                                    </Heading>
                                    <Text
                                      color="secondary"
                                      type="supporting"
                                      maxLines={1}>
                                      {currentPath}
                                    </Text>
                                  </Stack>
                                  <MetadataList style={styles.metadataCompact}>
                                    {currentProperties.map(prop => (
                                      <MetadataListItem
                                        key={prop.label}
                                        label={prop.label}>
                                        {prop.value}
                                      </MetadataListItem>
                                    ))}
                                  </MetadataList>
                                  <Stack
                                    direction="vertical"
                                    gap={2}
                                    style={styles.propertyActions}>
                                    <Button
                                      label="Format Document"
                                      size="sm"
                                      variant="secondary"
                                    />
                                    <Button
                                      label="Go to Definition"
                                      size="sm"
                                      variant="secondary"
                                    />
                                    <Button
                                      label="Find References"
                                      size="sm"
                                      variant="secondary"
                                    />
                                  </Stack>
                                </Stack>
                              ) : (
                                <Stack direction="vertical" gap={1}>
                                  <List>
                                    {([] as {label:string; time:string}[]).map(item => (
                                      <ListItem
                                        key={item.label}
                                        label={item.label}
                                        endContent={
                                          <Text
                                            type="supporting"
                                            color="secondary"
                                            maxLines={1}>
                                            {item.time}
                                          </Text>
                                        }
                                        startContent={
                                          <span
                                            style={styles.historyTimelineDot}
                                          />
                                        }
                                      />
                                    ))}
                                  </List>
                                </Stack>
                              )}
                            </Stack>
                          </LayoutPanel>
                        )}
                      </>
                    )
                  }
                />
              </LayoutContent>
            }
          />
        </LayoutContent>
      }
    />
      </div>
    </div>
  );
}

export default ArchitectureIdeOverlay;
