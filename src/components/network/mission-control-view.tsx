// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import { useBackendRefresh, requestBackendSync } from '@/lib/backend-sync';
import {useEffect, useRef, useState, type CSSProperties} from 'react';

import {Layout, LayoutContent, VStack, HStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
  ChatDictationButton,
  useChatDictation,
  type ChatComposerInputHandle,
  type ChatComposerTrigger,
} from '@astryxdesign/core/Chat';
import {
  createStaticSource,
  TypeaheadItem,
  type SearchableItem,
} from '@astryxdesign/core/Typeahead';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {Token} from '@astryxdesign/core/Token';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Grid} from '@astryxdesign/core/Grid';
import {Icon} from '@astryxdesign/core/Icon';
import {DropdownMenu, DropdownMenuItem} from '@astryxdesign/core/DropdownMenu';
import {useGraphStore} from '@/lib/graph/store';
import {useAIChatStore} from '@/lib/ai-chat-store';
import { CtxIcon } from '@/components/ui/primitives';
import { ModelSelectorPopover } from './model-selector-popover';
import { ChatComposerFx, ChatThinkingStatus, triggerFullScreenGenerativeWave } from './chat-composer-fx';
import {
  AtSymbolIcon,
  FolderIcon,
  PaperClipIcon,
  PlusIcon,
  SparklesIcon,
  PencilSquareIcon,
  CodeBracketIcon,
  MagnifyingGlassIcon,
  LockClosedIcon,
  ClockIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';

// Fill the content area so the greeting and composer stay vertically centered.
const pageStyle: CSSProperties = {minHeight: 'auto', paddingTop: '32px', paddingBottom: '32px'};
const composerInput: CSSProperties = {minHeight: 84};
const categories: CSSProperties = {paddingInline: 'var(--spacing-3)'};

// Suggestion cards shown once a category is selected.
const CATEGORY_SUGGESTIONS: Record<
  string,
  Array<{heading: string; body: string; prompt: string}>
> = {
  writing: [
    {
      heading: 'Draft a professional email',
      body: 'Compose a clear, polished email for any audience',
      prompt: 'Help me draft a professional email',
    },
    {
      heading: 'Improve my writing',
      body: 'Enhance the clarity, tone, and flow of my text',
      prompt: 'Review and improve the following text:',
    },
    {
      heading: 'Create a project proposal',
      body: 'Write a proposal with goals, timeline, and deliverables',
      prompt: 'Help me write a project proposal for',
    },
    {
      heading: 'Summarize a document',
      body: 'Condense a long document into key takeaways',
      prompt: 'Summarize the following document into key points:',
    },
  ],
  coding: [
    {
      heading: 'Debug my code',
      body: 'Find and fix issues in a code snippet',
      prompt: 'Help me debug the following code:',
    },
    {
      heading: 'Write a function',
      body: 'Generate a well-typed function with error handling',
      prompt: 'Write a function that',
    },
    {
      heading: 'Explain this code',
      body: 'Break down complex code into understandable pieces',
      prompt: 'Explain what the following code does:',
    },
    {
      heading: 'Review my pull request',
      body: 'Check for bugs, performance, and best practices',
      prompt: 'Review this code for bugs and improvements:',
    },
  ],
  research: [
    {
      heading: 'Compare options',
      body: 'Analyze pros and cons of different approaches',
      prompt: 'Compare the pros and cons of',
    },
    {
      heading: 'Explain a concept',
      body: 'Break down a complex topic in simple terms',
      prompt: 'Explain the concept of',
    },
    {
      heading: 'Find best practices',
      body: 'Research standards and recommended approaches',
      prompt: 'What are the best practices for',
    },
    {
      heading: 'Summarize findings',
      body: 'Compile research into a structured overview',
      prompt: 'Summarize the key findings on',
    },
  ],
  creative: [
    {
      heading: 'Brainstorm ideas',
      body: 'Generate creative concepts for a project',
      prompt: 'Brainstorm ideas for',
    },
    {
      heading: 'Write a story',
      body: 'Create an engaging narrative with characters',
      prompt: 'Write a short story about',
    },
    {
      heading: 'Design a concept',
      body: 'Explore product or visual design ideas',
      prompt: 'Help me design a concept for',
    },
    {
      heading: 'Create a tagline',
      body: 'Craft a memorable phrase for a brand or product',
      prompt: 'Create a catchy tagline for',
    },
  ],
};

// Category filters, shared by the toggle group and the composer mode menu.
const CATEGORIES = [
  {key: 'writing', label: 'Writing', icon: PencilSquareIcon},
  {key: 'coding', label: 'Coding', icon: CodeBracketIcon},
  {key: 'research', label: 'Research', icon: MagnifyingGlassIcon},
  {key: 'creative', label: 'Creative', icon: LightBulbIcon},
] as const;

// Composer mode menu: categories plus special modes.
const MODE_OPTIONS = [
  {key: 'auto', label: 'Auto', icon: SparklesIcon},
  ...CATEGORIES,
  {key: 'sensitive', label: 'Sensitive', icon: LockClosedIcon},
  {key: 'deep', label: 'Deep Mode', icon: ClockIcon},
] as const;

// Modes that insert a composer token instead of switching the active category.
const TOKEN_MODES: Record<string, string> = {
  sensitive: '/sensitive',
  deep: '/deep-mode',
};

// Composer trigger data: @ mentions and / commands.
const TEMPLATE_MENTION_ITEMS: SearchableItem<{role: string}>[] = [
  {id: 'cindy', label: 'Cindy Zhang', auxiliaryData: {role: 'Design Systems'}},
  {id: 'alex', label: 'Alex Johnson', auxiliaryData: {role: 'Frontend'}},
  {id: 'sam', label: 'Sam Rivera', auxiliaryData: {role: 'Backend'}},
  {id: 'jordan', label: 'Jordan Lee', auxiliaryData: {role: 'Product'}},
  {id: 'taylor', label: 'Taylor Kim', auxiliaryData: {role: 'Design'}},
  {id: 'morgan', label: 'Morgan Chen', auxiliaryData: {role: 'Infrastructure'}},
];

const COMMAND_ITEMS: SearchableItem<{description: string}>[] = [
  {
    id: 'summarize',
    label: 'summarize',
    auxiliaryData: {description: 'Summarize the conversation'},
  },
  {
    id: 'translate',
    label: 'translate',
    auxiliaryData: {description: 'Translate text to another language'},
  },
  {
    id: 'search',
    label: 'search',
    auxiliaryData: {description: 'Search the web or documents'},
  },
  {
    id: 'code',
    label: 'code',
    auxiliaryData: {description: 'Generate or explain code'},
  },
  {
    id: 'help',
    label: 'help',
    auxiliaryData: {description: 'Show available commands'},
  },
];

const mentionTrigger: ChatComposerTrigger = {
  character: '@',
  searchSource: createStaticSource(TEMPLATE_MENTION_ITEMS),
  renderItem: item => (
    <TypeaheadItem
      item={item}
      description={(item.auxiliaryData as {role: string})?.role}
    />
  ),
  onSelect: item => ({
    value: `@${item.id}`,
    label: item.label,
    variant: 'blue',
  }),
};

const commandTrigger: ChatComposerTrigger = {
  character: '/',
  searchSource: createStaticSource(COMMAND_ITEMS),
  renderItem: item => (
    <TypeaheadItem
      item={item}
      description={(item.auxiliaryData as {description: string})?.description}
    />
  ),
  onSelect: item => ({
    value: `/${item.label}`,
    label: `/${item.label}`,
    variant: 'yellow',
  }),
};

// Main component

import type { GraphMetrics } from "@/lib/graph/types";

export interface MissionControlViewProps {
  metrics?: GraphMetrics;
  runtime?: unknown;
  documents?: unknown[];
  onComplete?: () => Promise<void> | void;
}

export function MissionControlView({
  onComplete,
}: MissionControlViewProps = {}) {
  const [mode, setMode] = useState<string | null>('auto');
  const [category, setCategory] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<{id: string; name: string}[]>([]);
  const [liveAgents, setLiveAgents] = useState<{id: string; label: string; auxiliaryData: {role: string}}[]>([{id:'ctx-app-agent',label:'CTX App Agent',auxiliaryData:{role:'Chat, generative UI, and app drafts'}}]);
  const [agentId, setAgentId] = useState('ctx-app-agent');
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);
  const [instructions, setInstructions] = useState<{seq: number; at: number; data: {text: string; agentId: string}}[]>([]);
  useBackendRefresh(async () => {
    try {
      const responses = await Promise.all([fetch('/api/agents', {cache:'no-store'}), fetch('/api/agents/instructions', {cache:'no-store'})]);
      if (responses.some(r => !r.ok)) throw new Error('Unable to load orchestrator. Operator authentication may be required.');
      const [overview, history] = await Promise.all(responses.map(r => r.json()));
      setLiveAgents([{id:'ctx-app-agent',label:'CTX App Agent',auxiliaryData:{role:'Chat, generative UI, and app drafts'}}, {id:'orchestrator', label:'ASP Orchestrator', auxiliaryData:{role:'Reviewed workflow instruction intake'}}, ...overview.agents.map((agent: {id: string}) => ({id: agent.id, label: agent.id, auxiliaryData: {role: 'ASP background workflow agent'}}))]);
      setInstructions(history);
    } catch (error) { setFeedback((error as Error).message); }
  });
  const uploadFiles = async (files: File[]) => {
    setPending(true);
    try {
      for (const file of files) {
        const form = new FormData(); form.append('file', file);
        const response = await fetch('/api/documents', {method:'POST', body:form});
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setAttachments(previous => [...previous, {id:result.id, name:result.originalName ?? file.name}]);
      }
      requestBackendSync(); await onComplete?.();
    } catch (error) { setFeedback((error as Error).message); } finally { setPending(false); }
  };
  const dispatch = async (text: string) => {
    setPending(true); setFeedback('');
    try {
      if(agentId==='ctx-app-agent') {
        triggerFullScreenGenerativeWave();
        const conversationId = await useAIChatStore.getState().createConversation(text, attachments);
        useGraphStore.getState().setSelectedChatId(conversationId);
        useGraphStore.getState().setViewMode('ai-chat');
        window.history.pushState({}, '', `/?view=ai-chat&chat=${encodeURIComponent(conversationId)}`);
        setAttachments([]);
        return;
      }
      const response = await fetch('/api/agents', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'dispatch-instruction', agentId, text, documentIds:attachments.map(a => a.id)})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Instruction dispatch failed');
      setFeedback('Instruction received by the orchestrator. Workflow execution requires review.');
      setAttachments([]); requestBackendSync(); await onComplete?.();
    } catch (error) { composerInputRef.current?.insertText(text); setFeedback((error as Error).message); } finally { setPending(false); }
  };
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    let active = true;
    void fetch('/api/session', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (active && data && typeof data === 'object' && 'profileName' in data && typeof data.profileName === 'string' && data.profileName.trim()) {
          setProfileName(data.profileName.trim());
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const composerInputRef = useRef<ChatComposerInputHandle>(null);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusComposerRef = useRef(false);
  const dictation = useChatDictation({
    inputRef: composerInputRef,
    continuous: true,
    interimResults: true,
    onError: (err) => setFeedback(err.message || 'Microphone dictation is unavailable.'),
  });

  const activeMode = MODE_OPTIONS.find(m => m.key === mode) ?? MODE_OPTIONS[0];
  const suggestions = category ? CATEGORY_SUGGESTIONS[category] : null;

  // The composer's imperative insert methods mutate the DOM without emitting a
  // change, so dispatch an input event to sync its value and clear the placeholder.
  const syncComposerValue = () => {
    document.activeElement?.dispatchEvent(new Event('input', {bubbles: true}));
  };

  const applySuggestion = (prompt: string) => {
    const input = composerInputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    if (document.activeElement) {
      window.getSelection()?.selectAllChildren(document.activeElement);
    }
    input.insertText(prompt);
    syncComposerValue();
  };

  const insertMention = (item: (typeof TEMPLATE_MENTION_ITEMS)[number]) => {
    const input = composerInputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    if (document.activeElement) {
      const sel = window.getSelection();
      sel?.selectAllChildren(document.activeElement);
      sel?.collapseToEnd();
    }
    input.insertToken({
      value: `@${item.id}`,
      label: item.label,
      variant: 'blue',
    });
    syncComposerValue();
  };

  const insertModeToken = (label: string) => {
    composerInputRef.current?.focus();
    composerInputRef.current?.insertToken({
      value: label,
      label,
      variant: 'orange',
    });
    syncComposerValue();
  };

  return (
    <Layout
      className="ai-chat-landing"
      height="auto"
      contentWidth={728}
      padding={6}
      content={
        <LayoutContent>
          <VStack gap={8} vAlign="center" style={pageStyle}>
            {/* Greeting */}
            <VStack gap={1}>
              <HStack gap={2} vAlign="center">
                <Icon icon={SparklesIcon} size="md" color="accent" />
                <Text type="large" as="h2">
                  {profileName ? `Hi, ${profileName}` : 'Hi there'}
                </Text>
              </HStack>
              <Text type="display-2" as="h1">
                Where should we start?
              </Text>
            </VStack>

            {/* Composer */}
            <div
              style={{ width: '100%' }}
              onFocus={() => setIsComposerFocused(true)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setIsComposerFocused(false);
                }
              }}
            >
              <ChatComposerFx
                isFocused={isComposerFocused}
                isListening={mounted && dictation.isListening}
                voiceLevel={dictation.volume}
                borderRadius={22}>
                <ChatComposer
                  onSubmit={dispatch}
              isDisabled={pending}
              placeholder="Ask anything"
              input={
                <ChatComposerInput
                  handleRef={composerInputRef}
                  triggers={[{...mentionTrigger, searchSource:createStaticSource(liveAgents)}, commandTrigger]}
                  style={composerInput}
                  onFiles={uploadFiles}
                />
              }
              drawer={
                attachments.length > 0 ? (
                  <ChatComposerDrawer count={attachments.length}>
                    {attachments.map(attachment => (
                      <Token
                        key={attachment.id}
                        label={attachment.name}
                        onRemove={() =>
                          setAttachments(prev => prev.filter(n => n.id !== attachment.id))
                        }
                      />
                    ))}
                  </ChatComposerDrawer>
                ) : undefined
              }
              headerActions={
                <DropdownMenu
                  button={{
                    label: agentId === 'ctx-app-agent' ? 'CTX App Agent' : `Agent: ${agentId}`,
                    variant: 'ghost',
                    size: 'sm',
                    icon: agentId === 'ctx-app-agent' ? <CtxIcon size={22} /> : <Icon icon={AtSymbolIcon} size="sm" />,
                    isIconOnly: false,
                  }}
                  hasChevron={false}
                  menuWidth={240}>
                  {liveAgents.map(item => (
                    <DropdownMenuItem
                      key={item.id}
                      label={item.label}
                      description={item.auxiliaryData?.role}
                      icon={item.id === 'ctx-app-agent' ? <CtxIcon size={16} /> : undefined}
                      onClick={() => { setAgentId(item.id); if(item.id!=='ctx-app-agent') insertMention(item); }}
                    />
                  ))}
                </DropdownMenu>
              }
              footerActions={
                <>
                  <DropdownMenu
                    button={{
                      label: activeMode.label,
                      variant: 'ghost',
                      size: 'sm',
                      icon: <Icon icon={activeMode.icon} size="sm" />,
                      children: activeMode.label,
                    }}
                    menuWidth={200}
                    isMenuOpen={isModeMenuOpen}
                    onOpenChange={isOpen => {
                      setIsModeMenuOpen(isOpen);
                      // Restore focus to the composer after inserting a mode token.
                      if (!isOpen && shouldFocusComposerRef.current) {
                        shouldFocusComposerRef.current = false;
                        setTimeout(() => composerInputRef.current?.focus(), 50);
                      }
                    }}
                    items={MODE_OPTIONS.flatMap(opt => {
                      const item = {
                        label: opt.label,
                        icon: opt.icon,
                        onClick: () => {
                          const tokenLabel = TOKEN_MODES[opt.key];
                          if (tokenLabel) {
                            insertModeToken(tokenLabel);
                            shouldFocusComposerRef.current = true;
                          } else {
                            setMode(opt.key);
                          }
                        },
                      };
                      return opt.key === 'sensitive'
                        ? [{type: 'divider' as const}, item]
                        : [item];
                    })}
                  />
                  <ModelSelectorPopover />
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      if (files.length > 0) void uploadFiles(files);
                      event.target.value = '';
                    }}
                  />
                  <DropdownMenu
                    button={{
                      label: 'File',
                      variant: 'ghost',
                      size: 'sm',
                      icon: <Icon icon={PlusIcon} size="sm" />,
                      children: 'File',
                    }}
                    hasChevron={false}
                    menuWidth={220}
                    items={[
                      {
                        label: 'Upload or add files',
                        icon: PaperClipIcon,
                        isDisabled: pending,
                        onClick: () => fileInputRef.current?.click(),
                      },
                      {
                        label: 'Documents & Sources',
                        icon: FolderIcon,
                        onClick: () => useGraphStore.getState().setViewMode('sources'),
                      },
                      ...(attachments.length > 0
                        ? [
                            { type: 'divider' as const },
                            {
                              label: `Clear attachments (${attachments.length})`,
                              onClick: () => setAttachments([]),
                            },
                          ]
                        : []),
                    ]}
                  />
                </>
              }
                  sendActions={mounted ? <ChatDictationButton dictation={dictation} /> : undefined}
                />
              </ChatComposerFx>
            </div>

            {pending && (
              <ChatThinkingStatus
                size={64}
                state={mode === 'deep' ? 'searching' : 'connecting'}
                label={
                  mode === 'deep'
                    ? 'Preparing deep research…'
                    : 'Launching chat & generative UI…'
                }
              />
            )}

            {feedback && <Text role="status">{feedback}</Text>}
            {instructions.slice(-8).map(entry => <VStack key={entry.seq} gap={1}><Text>{entry.data.text}</Text><Text type="supporting" color="secondary">{entry.data.agentId} · Received {new Date(entry.at).toLocaleString()}</Text></VStack>)}
            {/* Category filters + suggestion cards */}
            <VStack gap={6} style={categories}>
              <ToggleButtonGroup
                label="Category"
                value={category}
                onChange={setCategory}
                size="lg">
                {CATEGORIES.map(cat => (
                  <ToggleButton
                    key={cat.key}
                    value={cat.key}
                    label={cat.label}
                    icon={<Icon icon={cat.icon} size="sm" />}
                  />
                ))}
              </ToggleButtonGroup>

              {suggestions && (
                <Grid columns={{minWidth: 280}} gap={3}>
                  {suggestions.map(suggestion => (
                    <ClickableCard
                      key={suggestion.heading}
                      label={suggestion.heading}
                      variant="muted"
                      padding={3}
                      onClick={() => {
                        applySuggestion(suggestion.prompt);
                        setMode(category);
                      }}>
                      <VStack gap={0.5}>
                        <Heading level={4}>{suggestion.heading}</Heading>
                        <Text type="body" color="secondary" size="xsm">
                          {suggestion.body}
                        </Text>
                      </VStack>
                    </ClickableCard>
                  ))}
                </Grid>
              )}
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}

export default MissionControlView;
