import { useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "react-i18next";

import type { AudioOutputFormat, FormatCandidate, MediaSelection, Video } from "@/domain/media";
import { createTrimRange } from "@/domain/media";
import { DomainError } from "@/errors/domain-error";
import { toHumanMessage } from "@/errors/human-message";
import { audioFormatHasBitrateChoice } from "@/ui/format-options";
import { estimateBytes, mediaDetails } from "@/ui/format-summary";
import { formatVideoSummary } from "@/ui/format-video-summary";
import { palette } from "@/ui/theme";
import { Screen, Spinner } from "@/ui/components/chrome";
import { Form, type FormRow } from "@/ui/components/form";
import { MediaCard } from "@/ui/components/media-card";
import { useServices } from "@/ui/services-context";

const AUDIO_FORMATS: readonly AudioOutputFormat[] = ["mp3", "aac", "opus", "flac", "wav"];
const AUDIO_QUALITY_MODES = ["cbr", "vbr"] as const;
const BITRATE_VALUES: readonly (number | "max")[] = ["max", 320, 256, 192, 128, 96];

type Draft = {
  readonly audioFormatIndex: number;
  readonly bitrateIndex: number;
  readonly qualityModeIndex: number;
  readonly trimEnabled: boolean;
  readonly trimStart: string;
  readonly trimEnd: string;
};

type BuildResult =
  | { readonly ok: true; readonly selection: MediaSelection }
  | { readonly ok: false; readonly message: string };

type Props = {
  readonly video: Video;
  /** "Video 2 of 5" when a playlist is configured entry by entry. */
  readonly progressLabel?: string;
  readonly onConfirm: (candidates: readonly FormatCandidate[], selection: MediaSelection) => void;
  readonly onBack: () => void;
};

export function FormatSelectionScreen({ video, progressLabel, onConfirm, onBack }: Props) {
  const { extraction, defaults } = useServices();
  const { t } = useTranslation();
  const [candidates, setCandidates] = useState<readonly FormatCandidate[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState("");
  const [trimError, setTrimError] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(() => ({
    audioFormatIndex: AUDIO_FORMATS.indexOf(defaults.defaultAudioFormat),
    bitrateIndex: BITRATE_VALUES.indexOf(defaults.defaultAudioBitrateKbps),
    qualityModeIndex: AUDIO_QUALITY_MODES.indexOf(defaults.defaultAudioQualityMode),
    trimEnabled: false,
    trimStart: "",
    trimEnd: "",
  }));

  useKeyboard((key) => {
    if (key.name === "escape") onBack();
  });

  useEffect(() => {
    const signal = new AbortController().signal;
    extraction.getFormatCandidates(video.id, signal).then(
      (result) => {
        setCandidates(result);
        setLoadState("ready");
      },
      (cause: unknown) => {
        setLoadError(
          cause instanceof DomainError ? toHumanMessage(cause) : t("formatSelection.loadError"),
        );
        setLoadState("error");
      },
    );
  }, [video.id, extraction, t]);

  if (loadState === "loading") {
    return (
      <Screen title={t("formatSelection.title")} hints={[]}>
        <Spinner label={t("formatSelection.loading")} />
      </Screen>
    );
  }

  if (loadState === "error") {
    return (
      <Screen title={t("formatSelection.title")} hints={[]}>
        <text fg={palette.red}>{loadError}</text>
      </Screen>
    );
  }

  const audioFormat = AUDIO_FORMATS[draft.audioFormatIndex] ?? "mp3";
  const bitrate = BITRATE_VALUES[draft.bitrateIndex] ?? "max";
  const qualityMode = AUDIO_QUALITY_MODES[draft.qualityModeIndex] ?? "vbr";
  const losslessAudio = !audioFormatHasBitrateChoice(audioFormat);

  function update(patch: Partial<Draft>): void {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function buildSelection(): BuildResult {
    const base: MediaSelection = {
      kind: "audio",
      format: audioFormat,
      bitrateKbps: losslessAudio ? "max" : bitrate,
      qualityMode: losslessAudio ? undefined : qualityMode,
      trim: undefined,
    };

    if (!draft.trimEnabled) {
      return { ok: true, selection: base };
    }

    const start = Number.parseInt(draft.trimStart.trim(), 10);
    if (Number.isNaN(start) || start < 0) {
      return { ok: false, message: t("formatSelection.trimStartNegative") };
    }
    const end = Number.parseInt(draft.trimEnd.trim(), 10);
    if (Number.isNaN(end)) {
      return { ok: false, message: t("formatSelection.trimInvalidNumber") };
    }
    if (end <= start) {
      return { ok: false, message: t("formatSelection.trimEndBeforeStart") };
    }
    return { ok: true, selection: { ...base, trim: createTrimRange(start, end) } };
  }

  function confirm(): void {
    const result = buildSelection();
    if (!result.ok) {
      setTrimError(result.message);
      return;
    }
    onConfirm(candidates, result.selection);
  }

  const tentative = buildSelection();
  const details = tentative.ok
    ? mediaDetails(video.title, tentative.selection, estimateBytes(candidates))
    : undefined;

  const rows: FormRow[] = [
    { kind: "heading", label: t("formatSelection.outputHeading") },
    {
      kind: "choice",
      id: "audio-format",
      label: t("formatSelection.formatLabel"),
      choices: AUDIO_FORMATS.map((format) => format.toUpperCase()),
      selectedIndex: draft.audioFormatIndex,
      onChange: (audioFormatIndex) => update({ audioFormatIndex }),
    },
    losslessAudio
      ? {
          kind: "info",
          text: t("formatSelection.losslessInfo", { format: audioFormat.toUpperCase() }),
          tone: "dim",
        }
      : {
          kind: "choice",
          id: "bitrate",
          label: t("formatSelection.qualityLabel"),
          choices: BITRATE_VALUES.map((value) =>
            value === "max" ? t("formatSelection.bestQuality") : `${value}`,
          ),
          selectedIndex: draft.bitrateIndex === -1 ? 0 : draft.bitrateIndex,
          onChange: (bitrateIndex) => update({ bitrateIndex }),
        },
    { kind: "heading", label: t("formatSelection.advancedHeading") },
    ...(losslessAudio
      ? []
      : [
          {
            kind: "choice",
            id: "quality-mode",
            label: t("formatSelection.qualityModeLabel"),
            choices: AUDIO_QUALITY_MODES.map((value) => value.toUpperCase()),
            selectedIndex: draft.qualityModeIndex,
            onChange: (qualityModeIndex: number) => update({ qualityModeIndex }),
          } as const,
        ]),
    {
      kind: "choice",
      id: "trim",
      label: t("formatSelection.trimLabel"),
      choices: [t("formatSelection.trimOff"), t("formatSelection.trimOn")],
      selectedIndex: draft.trimEnabled ? 1 : 0,
      onChange: (index) => {
        setTrimError(undefined);
        update({ trimEnabled: index === 1 });
      },
    },
    ...(draft.trimEnabled
      ? ([
          {
            kind: "input",
            id: "trim-start",
            label: t("formatSelection.trimStartLabel"),
            value: draft.trimStart,
            placeholder: t("formatSelection.trimPlaceholder"),
            onSubmit: (trimStart: string) => update({ trimStart }),
          },
          {
            kind: "input",
            id: "trim-end",
            label: t("formatSelection.trimEndLabel"),
            value: draft.trimEnd,
            placeholder: t("formatSelection.trimPlaceholder"),
            onSubmit: (trimEnd: string) => update({ trimEnd }),
          },
        ] as const)
      : []),
    ...(trimError !== undefined ? [{ kind: "info", text: trimError, tone: "error" } as const] : []),
    {
      kind: "action",
      id: "continue",
      label: t("formatSelection.continueLabel"),
      onTrigger: confirm,
    },
  ];

  return (
    <Screen
      title={t("formatSelection.title")}
      hints={[
        { keys: "↑↓", label: t("hints.move") },
        { keys: "←→", label: t("hints.change") },
        { keys: "Enter", label: t("hints.confirm") },
        { keys: "Esc", label: t("hints.back") },
      ]}
    >
      <MediaCard
        title={video.title}
        meta={formatVideoSummary(video).split(" · ")}
        badge={progressLabel}
        details={details}
      />
      <Form rows={rows} />
    </Screen>
  );
}
