"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, type ReactNode } from "react";
import type { DistortionWaveHandle } from "distortion-waves";
import type { OrbSize, OrbState } from "thinking-orbs";
import { HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";

const BorderBeam = dynamic(
  () => import("border-beam").then((mod) => mod.BorderBeam),
  { ssr: false }
);

const VoiceBeam = dynamic(
  () => import("voice-glow").then((mod) => mod.VoiceBeam),
  { ssr: false }
);

const ThinkingOrb = dynamic(
  () => import("thinking-orbs").then((mod) => mod.ThinkingOrb),
  { ssr: false }
);

const DistortionWave = dynamic(
  () => import("distortion-waves").then((mod) => mod.DistortionWave),
  { ssr: false }
);

const GENERATIVE_WAVE_EVENT = "ctxbankpro:generative-wave";

/**
 * Triggers the full-screen generative UI DistortionWave on the workspace stage.
 */
export function triggerFullScreenGenerativeWave() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(GENERATIVE_WAVE_EVENT));
  }
}

export interface ChatComposerFxProps {
  children: ReactNode;
  /** True when the composer is selected/focused for input. */
  isFocused?: boolean;
  /** True while microphone dictation is actively listening. */
  isListening?: boolean;
  /** Real-time 0..1 microphone level driving VoiceBeam height. */
  voiceLevel?: number;
  /** Corner radius in px matching the wrapped composer surface. */
  borderRadius?: number;
}

/**
 * Keeps VoiceBeam and BorderBeam permanently mounted in a stable wrapper hierarchy
 * so toggling `active` never remounts child controls (such as ModelSelectorPopover).
 * BorderBeam uses `duration={2.8}` (~30% slower than the 1.96s default).
 */
export function ChatComposerFx({
  children,
  isFocused = false,
  isListening = false,
  voiceLevel = 0,
  borderRadius = 22,
}: ChatComposerFxProps) {
  return (
    <VoiceBeam
      active={isListening}
      level={voiceLevel}
      colorVariant="ocean"
      borderRadius={borderRadius}
      style={{ width: "100%" }}
    >
      <BorderBeam
        active={isFocused && !isListening}
        size="md"
        duration={2.8}
        colorVariant="ocean"
        borderRadius={borderRadius}
        style={{ width: "100%" }}
      >
        {children}
      </BorderBeam>
    </VoiceBeam>
  );
}

export interface ChatThinkingStatusProps {
  state: OrbState;
  label?: string;
  size?: OrbSize;
}

/**
 * ThinkingOrb paired with a live cognitive state label.
 * Defaults to the prominent `size={64}` chat-avatar orb; pass `size={20}` for compact headers.
 */
export function ChatThinkingStatus({
  state,
  label,
  size = 64,
}: ChatThinkingStatusProps) {
  return (
    <HStack gap={size === 64 ? 3 : 2} vAlign="center">
      <ThinkingOrb
        state={state}
        size={size}
        theme="auto"
        gravity={false}
        aria-hidden="true"
      />
      {label ? (
        <Text type="supporting" color="secondary" size={size === 64 ? "sm" : undefined}>
          {label}
        </Text>
      ) : null}
    </HStack>
  );
}

/**
 * Wraps the opaque workspace view DOM so `triggerFullScreenGenerativeWave()`
 * visibly bends the active screen across Landing -> Conversation launches and
 * generative UI creation.
 */
export function WorkspaceDistortionStage({ children }: { children: ReactNode }) {
  const waveRef = useRef<DistortionWaveHandle>(null);

  useEffect(() => {
    const onTrigger = () => {
      window.requestAnimationFrame(() => {
        waveRef.current?.play();
      });
    };
    window.addEventListener(GENERATIVE_WAVE_EVENT, onTrigger);
    return () => {
      window.removeEventListener(GENERATIVE_WAVE_EVENT, onTrigger);
    };
  }, []);

  return (
    <DistortionWave
      ref={waveRef}
      type="center"
      style={{
        width: "100%",
        minHeight: "100%",
        height: "100%",
        background: "var(--background)",
      }}
    >
      {children}
    </DistortionWave>
  );
}
