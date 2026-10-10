import { useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "react-i18next";

import type {
  AudioOutputFormat,
  AudioQualityMode,
  FormatCandidate,
  MediaSelection,
  Video,
} from "@/domain/media";
import { createTrimRange } from "@/domain/media";
import {
  AUDIO_BITRATES,
  AUDIO_FORMATS,
  AUDIO_QUALITY_MODES,
  audioFormatHasBitrateChoice,
} from "@/ui/format-options";
import { failureMessage } from "@/errors/human-message";
import { estimateBytes, mediaDetails } from "@/ui/format-summary";
import { videoSummary } from "@/ui/format-video-summary";
import { palette } from "@/ui/theme";
import { Screen, Spinner } from "@/ui/components/chrome";
import { Form, choicesOf, type FormRow } from "@/ui/components/form";
import { MediaCard } from "@/ui/components/media-card";
import { useServices } from "@/ui/services-context";

type Draft = {
  readonly audioFormat: AudioOutputFormat;
  readonly bitrate: number | "max";
  readonly qualityMode: AudioQualityMode;
  readonly trimEnabled: boolean;
  readonly trimStart: string;
  readonly trimEnd: string;
};

type Formats =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly candidates: readonly FormatCandidate[] };

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
  const [formats, setFormats] = useState<Formats>({ kind: "loading" });
  const [trimError, setTrimError] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(() => ({
    audioFormat: defaults.defaultAudioFormat,
    // A custom persisted bitrate isn't offered here; start from the best quality instead.
    bitrate: AUDIO_BITRATES.includes(defaults.defaultAudioBitrateKbps)
      ? defaults.defaultAudioBitrateKbps
      : "max",
    qualityMode: defaults.defaultAudioQualityMode,
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
      (candidates) => setFormats({ kind: "ready", candidates }),
      (cause: unknown) =>
        setFormats({
          kind: "failed",
          message: failureMessage(cause, t("formatSelection.loadError")),
        }),
    );
  }, [video.id, extraction, t]);

  if (formats.kind === "loading") {
    return (
      <Screen title={t("formatSelection.title")} hints={[]}>
        <Spinner label={t("formatSelection.loading")} />
      </Screen>
    );
  }

  if (formats.kind === "failed") {
    return (
      <Screen title={t("formatSelection.title")} hints={[]}>
        <text fg={palette.red}>{formats.message}</text>
      </Screen>
    );
  }

  const { candidates } = formats;
  const losslessAudio = !audioFormatHasBitrateChoice(draft.audioFormat);
  const upperCase = (value: string) => value.toUpperCase();

  function update(patch: Partial<Draft>): void {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function buildSelection(): BuildResult {
    const base: MediaSelection = {
      kind: "audio",
      format: draft.audioFormat,
      bitrateKbps: losslessAudio ? "max" : draft.bitrate,
      qualityMode: losslessAudio ? undefined : draft.qualityMode,
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
      choices: choicesOf(AUDIO_FORMATS, draft.audioFormat, upperCase, (audioFormat) =>
        update({ audioFormat }),
      ),
    },
    losslessAudio
      ? {
          kind: "info",
          text: t("formatSelection.losslessInfo", { format: draft.audioFormat.toUpperCase() }),
          tone: "dim",
        }
      : {
          kind: "choice",
          id: "bitrate",
          label: t("formatSelection.qualityLabel"),
          choices: choicesOf(
            AUDIO_BITRATES,
            draft.bitrate,
            (value) => (value === "max" ? t("formatSelection.bestQuality") : `${value}`),
            (bitrate) => update({ bitrate }),
          ),
        },
    { kind: "heading", label: t("formatSelection.advancedHeading") },
    ...(losslessAudio
      ? []
      : [
          {
            kind: "choice",
            id: "quality-mode",
            label: t("formatSelection.qualityModeLabel"),
            choices: choicesOf(AUDIO_QUALITY_MODES, draft.qualityMode, upperCase, (qualityMode) =>
              update({ qualityMode }),
            ),
          } as const,
        ]),
    {
      kind: "choice",
      id: "trim",
      label: t("formatSelection.trimLabel"),
      choices: choicesOf(
        [false, true],
        draft.trimEnabled,
        (enabled) => (enabled ? t("formatSelection.trimOn") : t("formatSelection.trimOff")),
        (trimEnabled) => {
          setTrimError(undefined);
          update({ trimEnabled });
        },
      ),
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
        meta={videoSummary(video)}
        badge={progressLabel}
        details={details}
      />
      <Form rows={rows} />
    </Screen>
  );
}
