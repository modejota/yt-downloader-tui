import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "react-i18next";

import type { Defaults, Language, QueuePanelPosition } from "@/domain/config";
import { MAX_CONCURRENT_DOWNLOADS_HARD_CAP } from "@/domain/config";
import { saveDefaults } from "@/config/index";
import {
  AUDIO_BITRATES,
  AUDIO_FORMATS,
  AUDIO_QUALITY_MODES,
  audioFormatHasBitrateChoice,
} from "@/ui/format-options";
import { Form, choicesOf, type Choice, type FormRow } from "@/ui/components/form";
import { LegalNoticeScreen } from "@/ui/screens/legal-notice-screen";
import { Screen } from "@/ui/components/chrome";
import { useServices } from "@/ui/services-context";

const LANGUAGES: readonly Language[] = ["system", "en", "es"];
const SEARCH_RESULT_PRESETS: readonly number[] = [5, 10, 15, 20, 30, 50];
const PANEL_POSITIONS: readonly QueuePanelPosition[] = ["bottom", "top", "left", "right"];
const PARALLEL_DOWNLOADS = Array.from(
  { length: MAX_CONCURRENT_DOWNLOADS_HARD_CAP },
  (_, index) => index + 1,
);

/** Keeps a preset list usable when the persisted value isn't one of the presets. */
function withCurrent(values: readonly number[], current: number): number[] {
  return values.includes(current) ? [...values] : [...values, current].sort((a, b) => a - b);
}

export function SettingsScreen({ onBack }: { readonly onBack: () => void }) {
  const { t } = useTranslation();
  const { defaults, updateDefaults } = useServices();
  const [showLegalNotice, setShowLegalNotice] = useState(false);

  useKeyboard((key) => {
    if (key.name !== "escape") return;
    if (showLegalNotice) setShowLegalNotice(false);
    else onBack();
  });

  if (showLegalNotice) {
    return <LegalNoticeScreen onContinue={() => setShowLegalNotice(false)} />;
  }

  /** Each choice saves on its own: settings autosave as the user moves through them. */
  function choicesFor<Key extends keyof Defaults>(
    key: Key,
    values: readonly Defaults[Key][],
    describe: (value: Defaults[Key]) => string,
  ): Choice[] {
    return choicesOf(values, defaults[key], describe, (value) => save({ [key]: value }));
  }

  function save(partial: Partial<Defaults>): void {
    void saveDefaults(partial).then(updateDefaults);
  }

  const upperCase = (value: string) => value.toUpperCase();

  const rows: FormRow[] = [
    { kind: "heading", label: t("settings.generalHeading") },
    {
      kind: "choice",
      id: "language",
      label: t("settings.languageLabel"),
      choices: choicesFor("language", LANGUAGES, (language) => t(`settings.language.${language}`)),
    },
    { kind: "heading", label: t("settings.defaultsHeading") },
    {
      kind: "choice",
      id: "audio-format",
      label: t("settings.audioFormatLabel"),
      choices: choicesFor("defaultAudioFormat", AUDIO_FORMATS, upperCase),
    },
    ...(audioFormatHasBitrateChoice(defaults.defaultAudioFormat)
      ? ([
          {
            kind: "choice",
            id: "audio-bitrate",
            label: t("settings.audioBitrateLabel"),
            choices: choicesFor("defaultAudioBitrateKbps", AUDIO_BITRATES, (value) =>
              value === "max" ? t("settings.best") : `${value}`,
            ),
          },
          {
            kind: "choice",
            id: "audio-quality-mode",
            label: t("settings.qualityModeLabel"),
            choices: choicesFor("defaultAudioQualityMode", AUDIO_QUALITY_MODES, upperCase),
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
      choices: choicesFor("maxConcurrentDownloads", PARALLEL_DOWNLOADS, String),
    },
    {
      kind: "choice",
      id: "search-results",
      label: t("settings.resultsLabel"),
      choices: choicesFor(
        "searchResultsCount",
        withCurrent(SEARCH_RESULT_PRESETS, defaults.searchResultsCount),
        String,
      ),
    },
    {
      kind: "choice",
      id: "panel-position",
      label: t("settings.panelLabel"),
      choices: choicesFor("queuePanelPosition", PANEL_POSITIONS, (position) =>
        t(`settings.panel.${position}`),
      ),
    },
    {
      kind: "choice",
      id: "embed-metadata",
      label: t("settings.metadataLabel"),
      choices: choicesFor("embedMetadata", [false, true], (embed) =>
        embed ? t("settings.yes") : t("settings.no"),
      ),
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
