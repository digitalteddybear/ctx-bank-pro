"use client";

import {Text} from "@astryxdesign/core/Text";
import { Switch } from "@astryxdesign/core/Switch";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { useApplicationTheme } from "./astryx-theme-provider";

export function ThemeSwitch() {
  const { theme, setPreference } = useApplicationTheme();

  return (
    <Switch
      isLabelHidden
      label="Light mode"
      value={theme === "light"}
      onChange={(isLight) => setPreference(isLight ? "light" : "dark")}
    />
  );
}

export function ThemePreferenceControl() {
  const { preference, setPreference,saveError } = useApplicationTheme();

  return (
    <><SegmentedControl
      label="Appearance preference"
      onChange={(value) => setPreference(value as "system" | "dark" | "light")}
      size="sm"
      value={preference}
    >
      <SegmentedControlItem label="System" value="system" />
      <SegmentedControlItem label="Dark" value="dark" />
      <SegmentedControlItem label="Light" value="light" />
    </SegmentedControl>{saveError&&<Text role="alert">{saveError}</Text>}</>
  );
}
