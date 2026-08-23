import { useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "react-i18next";

import type { MediaSelection, Video } from "@/domain/media";
import { Form, type FormRow } from "@/ui/components/form";
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
      readonly index: number;
      readonly collected: readonly MediaSelection[];
    };

type Props = {
  readonly videos: readonly Video[];
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

  const firstVideo = videos[0];

  useEffect(() => {
    if (firstVideo === undefined) onBack();
  }, [firstVideo, onBack]);

  if (firstVideo === undefined) {
    return <text>{t("playlistFormat.goingBack")}</text>;
  }

  if (step.name === "mode-prompt") {
    const rows: FormRow[] = [
      { kind: "heading", label: t("playlistFormat.modeTitle", { count: videos.length }) },
      {
        kind: "choice",
        id: "mode",
        label: t("playlistFormat.modeLabel"),
        choices: [t("playlistFormat.applyToAll"), t("playlistFormat.configureIndividually")],
        selectedIndex: sharedMode ? 0 : 1,
        onChange: (index) => setSharedMode(index === 0),
      },
      {
        kind: "action",
        id: "continue",
        label: t("playlistFormat.continue"),
        onTrigger: () =>
          setStep(
            sharedMode
              ? { name: "shared-format" }
              : { name: "individual-format", index: 0, collected: [] },
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
        video={firstVideo}
        onConfirm={(_candidates, selection) =>
          onConfirm(videos.map((video) => ({ video, selection })))
        }
        onBack={() => setStep({ name: "mode-prompt" })}
      />
    );
  }

  const current = videos[step.index];
  if (current === undefined) {
    return <text>{t("playlistFormat.preparingDestination")}</text>;
  }

  return (
    <FormatSelectionScreen
      key={current.id}
      video={current}
      progressLabel={t("playlistFormat.videoProgress", {
        index: step.index + 1,
        count: videos.length,
      })}
      onConfirm={(_candidates, selection) => {
        const collected = [...step.collected, selection];
        if (collected.length >= videos.length) {
          const pairs = videos
            .map((video, index): VideoSelectionPair | undefined => {
              const pairSelection = collected[index];
              return pairSelection === undefined ? undefined : { video, selection: pairSelection };
            })
            .filter((pair): pair is VideoSelectionPair => pair !== undefined);
          onConfirm(pairs);
          return;
        }
        setStep({ name: "individual-format", index: step.index + 1, collected });
      }}
      onBack={() =>
        step.index === 0
          ? setStep({ name: "mode-prompt" })
          : setStep({
              name: "individual-format",
              index: step.index - 1,
              collected: step.collected.slice(0, -1),
            })
      }
    />
  );
}
