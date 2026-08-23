import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "react-i18next";

import type { Defaults, Language, QueuePanelPosition } from "@/domain/config";
import { MAX_CONCURRENT_DOWNLOADS_HARD_CAP } from "@/domain/config";
import type { AudioOutputFormat, AudioQualityMode } from "@/domain/media";
import { saveDefaults } from "@/config/index";
import { audioFormatHasBitrateChoice } from "@/ui/format-options";
import { Form, type FormRow } from "@/ui/components/form";
import { LegalNoticeScreen } from "@/ui/screens/legal-notice-screen";
import { Screen } from "@/ui/components/chrome";
import { useServices } from "@/ui/services-context";

const LANGUAGES: readonly Language[] = ["system", "en", "es"];
const AUDIO_FORMATS: readonly AudioOutputFormat[] = ["mp3", "aac", "opus", "flac", "wav"];
const AUDIO_QUALITY_MODES: readonly AudioQualityMode[] = ["cbr", "vbr"];
const BITRATES_KBPS: readonly number[] = [320, 256, 192, 128, 96];
const SEARCH_RESULT_PRESETS: readonly number[] = [5, 10, 15, 20, 30, 50];
const PANEL_POSITIONS: readonly QueuePanelPosition[] = ["bottom", "top", "left", "right"];
const BITRATE_VALUES: readonly (number | "max")[] = ["max", ...BITRATES_KBPS];

/** Keeps a preset list usable when the persisted value isn't one of the presets. */
function withCurrent(values: readonly number[], current: number): number[] {
  return values.includes(current) ? [...values] : [...values, current].sort((a, b) => a - b);
}

export function SettingsScreen({ onBack }: { readonly onBack: () => void }) {
  const { t } = useTranslation();
  const { defaults, updateDefaults } = useServices();
  const [showLegalNotice, setShowLegalNotice] = useState(false);

  useKeyboard((key) => {
    if (key.name === "escape") {
      if (showLegalNotice) setShowLegalNotice(false);
      else onBack();
    }
  });

  function save(partial: Partial<Defaults>): void {
    void saveDefaults(partial).then(updateDefaults);
  }

  if (showLegalNotice) {
    return <LegalNoticeScreen onContinue={() => setShowLegalNotice(false)} />;
  }

  const searchCounts = withCurrent(SEARCH_RESULT_PRESETS, defaults.searchResultsCount);
  const audioHasBitrate = audioFormatHasBitrateChoice(defaults.defaultAudioFormat);

  const rows: FormRow[] = [
    { kind: "heading", label: t("settings.generalHeading") },
    {
      kind: "choice",
      id: "language",
      label: t("settings.languageLabel"),
      choices: LANGUAGES.map((language) => t(`settings.language.${language}`)),
      selectedIndex: LANGUAGES.indexOf(defaults.language),
      onChange: (index: number) => save({ language: LANGUAGES[index] ?? defaults.language }),
    },
    { kind: "heading", label: t("settings.defaultsHeading") },
    {
      kind: "choice",
      id: "audio-format",
      label: t("settings.audioFormatLabel"),
      choices: AUDIO_FORMATS.map((format) => format.toUpperCase()),
      selectedIndex: AUDIO_FORMATS.indexOf(defaults.defaultAudioFormat),
      onChange: (index: number) => save({ defaultAudioFormat: AUDIO_FORMATS[index] ?? "mp3" }),
    },
    ...(audioHasBitrate
      ? ([
          {
            kind: "choice",
            id: "audio-bitrate",
            label: t("settings.audioBitrateLabel"),
            choices: BITRATE_VALUES.map((value) =>
              value === "max" ? t("settings.best") : `${value}`,
            ),
            selectedIndex: BITRATE_VALUES.indexOf(defaults.defaultAudioBitrateKbps),
            onChange: (index: number) =>
              save({ defaultAudioBitrateKbps: BITRATE_VALUES[index] ?? "max" }),
          },
          {
            kind: "choice",
            id: "audio-quality-mode",
            label: t("settings.qualityModeLabel"),
            choices: AUDIO_QUALITY_MODES.map((mode) => mode.toUpperCase()),
            selectedIndex: AUDIO_QUALITY_MODES.indexOf(defaults.defaultAudioQualityMode),
            onChange: (index: number) =>
              save({ defaultAudioQualityMode: AUDIO_QUALITY_MODES[index] ?? "vbr" }),
          },
        ] as const)
      : []),
    { kind: "heading", label: t("settings.downloadsHeading") },
    {
      kind: "input",
      id: "download-folder",
      label: t("settings.folderLabel"),
      value: defaults.downloadFolder,
      placeholder: t("settings.folderPlaceholder"),
      onSubmit: (value) => {
        if (value.trim().length > 0) save({ downloadFolder: value.trim() });
      },
    },
    {
      kind: "choice",
      id: "parallel",
      label: t("settings.parallelLabel"),
      choices: Array.from(
        { length: MAX_CONCURRENT_DOWNLOADS_HARD_CAP },
        (_, index) => `${index + 1}`,
      ),
      selectedIndex: defaults.maxConcurrentDownloads - 1,
      onChange: (index: number) => save({ maxConcurrentDownloads: index + 1 }),
    },
    {
      kind: "choice",
      id: "search-results",
      label: t("settings.resultsLabel"),
      choices: searchCounts.map((count) => `${count}`),
      selectedIndex: searchCounts.indexOf(defaults.searchResultsCount),
      onChange: (index: number) => save({ searchResultsCount: searchCounts[index] ?? 15 }),
    },
    {
      kind: "choice",
      id: "panel-position",
      label: t("settings.panelLabel"),
      choices: PANEL_POSITIONS.map((position) => t(`settings.panel.${position}`)),
      selectedIndex: PANEL_POSITIONS.indexOf(defaults.queuePanelPosition),
      onChange: (index: number) =>
        save({ queuePanelPosition: PANEL_POSITIONS[index] ?? defaults.queuePanelPosition }),
    },
    {
      kind: "choice",
      id: "embed-metadata",
      label: t("settings.metadataLabel"),
      choices: [t("settings.no"), t("settings.yes")],
      selectedIndex: defaults.embedMetadata ? 1 : 0,
      onChange: (index: number) => save({ embedMetadata: index === 1 }),
    },
    { kind: "heading", label: t("settings.aboutHeading") },
    {
      kind: "action",
      id: "legal-notice",
      label: t("settings.legalNoticeLabel"),
      tone: "normal",
      onTrigger: () => setShowLegalNotice(true),
    },
    { kind: "info", text: t("settings.savesAutomatically"), tone: "dim" },
  ];

  return (
    <Screen
      title={t("settings.title")}
      hints={[
        { keys: "↑↓", label: t("hints.move") },
        { keys: "←→", label: t("hints.change") },
        { keys: "Esc", label: t("hints.back") },
      ]}
    >
      <Form rows={rows} />
    </Screen>
  );
}
