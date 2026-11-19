"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Popover } from "@astryxdesign/core/Popover";
import { Selector } from "@astryxdesign/core/Selector";
import { Slider } from "@astryxdesign/core/Slider";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Cog6ToothIcon, CpuChipIcon } from "@heroicons/react/24/outline";
import { z } from "zod";
import { IconButton } from "@/components/ui/primitives";
import {
  AI_SETTINGS_STORAGE_KEY,
  DEFAULT_AI_SETTINGS,
  aiSettingsSchema,
  aiSettingsSnapshotSchema,
  openAIModelCatalogSchema,
  openAIOAuthStatusSchema,
  providerStatusSchema,
  type AISettings,
} from "@/lib/ai-settings";
import { useGraphStore } from "@/lib/graph/store";

type ProviderId = AISettings["models"]["generalChat"]["provider"];
type ProviderStatus = z.infer<typeof providerStatusSchema>;

const ALL_PROVIDERS: { value: ProviderId; label: string; statusKey?: keyof ProviderStatus }[] = [
  { value: "auto", label: "Automatic" },
  { value: "openrouter", label: "OpenRouter", statusKey: "openrouter" },
  { value: "openai", label: "OpenAI", statusKey: "openai" },
  { value: "openai-oauth", label: "OpenAI ChatGPT", statusKey: "openaiOAuth" },
  { value: "anthropic", label: "Anthropic", statusKey: "anthropic" },
  { value: "openai-compatible", label: "OpenAI-compatible", statusKey: "openaiCompatible" },
  { value: "ollama", label: "Ollama", statusKey: "ollama" },
];

const PROVIDER_FALLBACK_MODELS: Record<Exclude<ProviderId, "auto" | "openai-oauth">, { value: string; label: string }[]> = {
  openai: [
    { value: "gpt-4o", label: "gpt-4o" },
    { value: "gpt-4.1", label: "gpt-4.1" },
    { value: "o3-mini", label: "o3-mini" },
  ],
  openrouter: [
    { value: "anthropic/claude-3.7-sonnet", label: "anthropic/claude-3.7-sonnet" },
    { value: "openai/gpt-4o", label: "openai/gpt-4o" },
  ],
  anthropic: [
    { value: "claude-3-7-sonnet-latest", label: "claude-3-7-sonnet-latest" },
    { value: "claude-3-5-haiku-latest", label: "claude-3-5-haiku-latest" },
  ],
  "openai-compatible": [{ value: "default", label: "Default endpoint model" }],
  ollama: [{ value: "nemotron-3.5-lightning:latest", label: "nemotron-3.5-lightning:latest" }],
};

const EFFORT_STEPS = [
  { extended: false, tokenBudget: 4096, label: "Off" },
  { extended: true, tokenBudget: 4096, label: "Low" },
  { extended: true, tokenBudget: 8192, label: "Med" },
  { extended: true, tokenBudget: 24576, label: "High" },
] as const;

function stepFromReasoning(reasoning: AISettings["reasoning"]): number {
  if (!reasoning.extended) return 0;
  if (reasoning.tokenBudget <= 4096) return 1;
  if (reasoning.tokenBudget <= 12288) return 2;
  return 3;
}

function providerLogoSrc(provider: ProviderId, modelValue: string): string | null {
  if (provider === "auto") return null;
  if (provider === "openai" || provider === "openai-oauth") {
    if (modelValue.startsWith("anthropic/")) return "/assets/providers/anthropic.svg";
    if (modelValue.startsWith("google/")) return "/assets/providers/google.svg";
    return "/assets/providers/openai.svg";
  }
  if (provider === "anthropic") return "/assets/providers/anthropic.svg";
  if (provider === "openai-compatible") return "/assets/providers/openai.svg";
  return null;
}

export function ModelSelectorPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [oauthModels, setOAuthModels] = useState<{ id: string; name: string }[]>([]);
  const [saveError, setSaveError] = useState("");
  const revisionRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const queuedSettingsRef = useRef<AISettings | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
      if (stored) setSettings(aiSettingsSchema.parse(JSON.parse(stored)));
    } catch {
      /* Fallback to server settings below. */
    }

    void fetch("/api/ai-workspace/settings", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const snapshot = aiSettingsSnapshotSchema.parse(await res.json());
        revisionRef.current = snapshot.revision;
        if (snapshot.revision > 0) setSettings(snapshot.settings);
      })
      .catch(() => {});

    void fetch("/api/ctx-app-agent", { cache: "no-store" })
      .then(async (res) => {
        if (res.ok) setProviders(providerStatusSchema.parse(await res.json()));
      })
      .catch(() => setProviders(null));

    void fetch("/api/auth/openai", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const status = openAIOAuthStatusSchema.parse(await res.json());
        if (status.connected && status.canUsePlan) {
          const modelRes = await fetch("/api/auth/openai?resource=models", { cache: "no-store" });
          if (modelRes.ok) {
            setOAuthModels(openAIModelCatalogSchema.parse(await modelRes.json()).models);
          }
        }
      })
      .catch(() => {});
  }, []);

  const flushPersist = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      while (queuedSettingsRef.current) {
        const next = queuedSettingsRef.current;
        queuedSettingsRef.current = null;

        if (revisionRef.current === null) {
          const initRes = await fetch("/api/ai-workspace/settings", { cache: "no-store" });
          if (!initRes.ok) break;
          const snap = aiSettingsSnapshotSchema.parse(await initRes.json());
          revisionRef.current = snap.revision;
        }

        let res = await fetch("/api/ai-workspace/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: next, revision: revisionRef.current }),
        });

        if (res.status === 409) {
          const freshRes = await fetch("/api/ai-workspace/settings", { cache: "no-store" });
          if (freshRes.ok) {
            const snap = aiSettingsSnapshotSchema.parse(await freshRes.json());
            revisionRef.current = snap.revision;
            res = await fetch("/api/ai-workspace/settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ settings: next, revision: revisionRef.current }),
            });
          }
        }

        if (res.ok) {
          const saved = aiSettingsSnapshotSchema.parse(await res.json());
          revisionRef.current = saved.revision;
          setSaveError("");
        } else {
          setSaveError("Could not save settings.");
        }
      }
    } catch {
      setSaveError("Could not save settings.");
    } finally {
      savingRef.current = false;
      if (queuedSettingsRef.current) {
        void flushPersist();
      }
    }
  }, []);

  const persistSettings = useCallback(
    (next: AISettings) => {
      setSettings(next);
      setSaveError("");
      try {
        localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* Ignore storage quota errors. */
      }
      queuedSettingsRef.current = next;
      void flushPersist();
    },
    [flushPersist]
  );

  const configuredProviders = useMemo(() => {
    return ALL_PROVIDERS.filter((p) => {
      if (!p.statusKey) return true;
      return providers ? providers[p.statusKey] : false;
    });
  }, [providers]);

  const hasAnyProvider = configuredProviders.some((p) => p.value !== "auto");
  const chatModel = settings.models.generalChat;
  const activeProviderValue = configuredProviders.some((p) => p.value === chatModel.provider)
    ? chatModel.provider
    : "auto";

  const modelOptions = useMemo(() => {
    if (activeProviderValue === "auto") {
      return [{ value: "__auto__", label: "Automatic routing" }];
    }
    if (activeProviderValue === "openai-oauth") {
      if (oauthModels.length > 0) {
        return oauthModels.map((m) => ({ value: m.id, label: m.name }));
      }
      return chatModel.model
        ? [{ value: chatModel.model, label: chatModel.model }]
        : [{ value: "__auto__", label: "No OAuth models loaded" }];
    }
    const base = PROVIDER_FALLBACK_MODELS[activeProviderValue] ?? [];
    if (chatModel.model && !base.some((m) => m.value === chatModel.model)) {
      return [{ value: chatModel.model, label: chatModel.model }, ...base];
    }
    return base;
  }, [activeProviderValue, chatModel.model, oauthModels]);

  const activeModelValue =
    activeProviderValue === "auto"
      ? "__auto__"
      : chatModel.model || modelOptions[0]?.value || "__auto__";

  const effortStep = stepFromReasoning(settings.reasoning);
  const effortPreset = EFFORT_STEPS[effortStep];
  const providerLabel =
    configuredProviders.find((p) => p.value === activeProviderValue)?.label ?? "Automatic";
  const activeModelLabel =
    modelOptions.find((m) => m.value === activeModelValue)?.label ?? activeModelValue;
  const triggerLabel =
    activeProviderValue === "auto"
      ? "Model"
      : activeModelValue && activeModelValue !== "__auto__"
        ? activeModelLabel
        : providerLabel;
  const logoSrc = providerLogoSrc(activeProviderValue, activeModelValue);

  const openAiSettings = () => {
    setIsOpen(false);
    useGraphStore.getState().setViewMode("ai-settings");
  };

  const content = (
    <VStack gap={2} style={{ padding: 0 }}>
      <HStack hAlign="between" vAlign="center">
        <Text type="label">Model &amp; effort</Text>
        <IconButton label="AI Settings" onClick={openAiSettings}>
          <Icon icon={Cog6ToothIcon} size="sm" />
        </IconButton>
      </HStack>

      <VStack gap={1.5}>
        <Selector
          label="Provider"
          size="sm"
          options={configuredProviders.map((p) => ({ value: p.value, label: p.label }))}
          value={activeProviderValue}
          onChange={(provider) => {
            if (!provider) return;
            const nextProvider = provider as ProviderId;
            const nextModel =
              nextProvider === "auto"
                ? ""
                : nextProvider === "openai-oauth"
                  ? oauthModels[0]?.id ?? ""
                  : PROVIDER_FALLBACK_MODELS[nextProvider]?.[0]?.value ?? "";
            persistSettings({
              ...settings,
              routing: nextProvider === "auto" ? settings.routing : "manual",
              models: {
                ...settings.models,
                generalChat: { provider: nextProvider, model: nextModel },
              },
            });
          }}
        />

        <Selector
          label="Model"
          size="sm"
          isDisabled={activeProviderValue === "auto"}
          options={modelOptions}
          value={activeModelValue}
          onChange={(model) => {
            if (!model || model === "__auto__") return;
            persistSettings({
              ...settings,
              models: {
                ...settings.models,
                generalChat: { ...chatModel, provider: activeProviderValue, model },
              },
            });
          }}
        />
      </VStack>

      <div style={{ padding: "4px 0 10px 0", boxSizing: "border-box", width: "100%" }}>
        <Slider
          className="thinking-effort-slider"
          label="Thinking effort"
          min={0}
          max={3}
          step={1}
          value={effortStep}
          valueDisplay="none"
          formatValue={(v) => EFFORT_STEPS[v]?.label ?? "Off"}
          marks={EFFORT_STEPS.map((s, idx) => ({ value: idx, label: s.label }))}
          description={`${effortPreset.label} · ${effortPreset.tokenBudget.toLocaleString()} token budget`}
          onChange={(val: number) => {
            const nextPreset = EFFORT_STEPS[val] ?? EFFORT_STEPS[0];
            setSettings((prev) => ({
              ...prev,
              reasoning: {
                ...prev.reasoning,
                extended: nextPreset.extended,
                tokenBudget: nextPreset.tokenBudget,
              },
            }));
          }}
          onChangeEnd={(val: number) => {
            const nextPreset = EFFORT_STEPS[val] ?? EFFORT_STEPS[0];
            persistSettings({
              ...settings,
              reasoning: {
                ...settings.reasoning,
                extended: nextPreset.extended,
                tokenBudget: nextPreset.tokenBudget,
              },
            });
          }}
        />
      </div>

      <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid color-mix(in srgb, var(--border-strong) 50%, transparent)" }}>
        <Text type="supporting" color="secondary" style={{ lineHeight: 1.4, fontSize: "11px" }}>
          {hasAnyProvider
            ? "Only configured providers are shown. Manage keys or OAuth in AI Settings."
            : "No providers configured. Add an API key or connect OpenAI in AI Settings."}
        </Text>
      </div>

      {saveError && (
        <Text type="supporting" color="secondary" role="alert" style={{ lineHeight: 1.35, fontSize: "11px" }}>
          {saveError}
        </Text>
      )}
    </VStack>
  );

  return (
    <Popover
      className="model-selector-popover-content"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      placement="below"
      alignment="start"
      width={340}
      label="Model and thinking effort"
      content={content}
    >
      <Button
        label={triggerLabel}
        variant="ghost"
        size="sm"
        icon={
          logoSrc ? (
            <img
              src={logoSrc}
              alt=""
              width={16}
              height={16}
              style={{ width: 16, height: 16, flexShrink: 0, display: "block" }}
            />
          ) : (
            <Icon icon={CpuChipIcon} size="sm" />
          )
        }
      />
    </Popover>
  );
}
