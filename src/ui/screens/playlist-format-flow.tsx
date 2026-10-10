import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "react-i18next";

import type { MediaSelection, Video } from "@/domain/media";
import { Form, choicesOf, type FormRow } from "@/ui/components/form";
import type { NonEmptyArray } from "@/ui/flow";
import { Screen } from "@/ui/components/chrome";
import { FormatSelectionScreen } from "@/ui/screens/format-selection-screen";

export type VideoSelectionPair = {
  readonly video: Video;
  readonly selection: MediaSelection;
};

type Step =
  | { readonly name: "mode-prompt" }
  | { readonly name: "shared-format" }
  | {
      readonly name: "individual-format";
      /** Already configured entries, in playlist order. */
      readonly configured: readonly VideoSelectionPair[];
      /** The entry being configured first, then the ones still waiting. */
      readonly remaining: NonEmptyArray<Video>;
    };

type Props = {
  readonly videos: NonEmptyArray<Video>;
  readonly onConfirm: (pairs: readonly VideoSelectionPair[]) => void;
  readonly onBack: () => void;
};

/**
 * Before configuring anything, ask whether the same MediaSelection applies
 * to every chosen entry or each gets its own — then walk
 * `FormatSelectionScreen` once (shared) or once per video (individual).
 */
export function PlaylistFormatFlow({ videos, onConfirm, onBack }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>({ name: "mode-prompt" });
  const [sharedMode, setSharedMode] = useState(true);

  useKeyboard((key) => {
    if (key.name === "escape" && step.name === "mode-prompt") onBack();
  });

  if (step.name === "mode-prompt") {
    const rows: FormRow[] = [
      { kind: "heading", label: t("playlistFormat.modeTitle", { count: videos.length }) },
      {
        kind: "choice",
        id: "mode",
        label: t("playlistFormat.modeLabel"),
        choices: choicesOf(
          [true, false],
          sharedMode,
          (shared) =>
            shared ? t("playlistFormat.applyToAll") : t("playlistFormat.configureIndividually"),
          setSharedMode,
        ),
      },
      {
        kind: "action",
        id: "continue",
        label: t("playlistFormat.continue"),
        onTrigger: () =>
          setStep(
            sharedMode
              ? { name: "shared-format" }
              : { name: "individual-format", configured: [], remaining: videos },
          ),
      },
    ];
    return (
      <Screen
        title={t("playlistFormat.title")}
        hints={[
          { keys: "↑↓", label: t("hints.move") },
          { keys: "←→", label: t("hints.change") },
          { keys: "Enter", label: t("hints.confirm") },
          { keys: "Esc", label: t("hints.back") },
        ]}
      >
        <Form rows={rows} />
      </Screen>
    );
  }

  if (step.name === "shared-format") {
    return (
      <FormatSelectionScreen
        video={videos[0]}
        onConfirm={(_candidates, selection) =>
          onConfirm(videos.map((video) => ({ video, selection })))
        }
        onBack={() => setStep({ name: "mode-prompt" })}
      />
    );
  }

  const { configured, remaining } = step;
  const [current, ...waiting] = remaining;

  return (
    <FormatSelectionScreen
      key={current.id}
      video={current}
      progressLabel={t("playlistFormat.videoProgress", {
        index: configured.length + 1,
        count: videos.length,
      })}
      onConfirm={(_candidates, selection) => {
        const nowConfigured = [...configured, { video: current, selection }];
        const [next, ...rest] = waiting;
        if (next === undefined) {
          onConfirm(nowConfigured);
          return;
        }
        setStep({
          name: "individual-format",
          configured: nowConfigured,
          remaining: [next, ...rest],
        });
      }}
      onBack={() => {
        const previous = configured.at(-1);
        if (previous === undefined) {
          setStep({ name: "mode-prompt" });
          return;
        }
        setStep({
          name: "individual-format",
          configured: configured.slice(0, -1),
          remaining: [previous.video, ...remaining],
        });
      }}
    />
  );
}
