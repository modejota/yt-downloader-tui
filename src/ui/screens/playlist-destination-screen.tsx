import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "react-i18next";

import type { Playlist } from "@/domain/media";
import { ensureWritable, resolveDestination, resolveDownloadDirectory } from "@/filesystem/index";
import { outputExtension } from "@/ui/format-options";
import { palette, inputStyle } from "@/ui/theme";
import { Card, ErrorLine, Screen, Spinner } from "@/ui/components/chrome";
import { failureMessage } from "@/errors/human-message";
import { onSubmitString } from "@/ui/opentui-input-fix";
import { useServices } from "@/ui/services-context";
import type { VideoSelectionPair } from "@/ui/screens/playlist-format-flow";

type Props = {
  readonly playlist: Playlist;
  readonly pairs: readonly VideoSelectionPair[];
  readonly onDone: (enqueuedCount: number) => void;
  readonly onBack: () => void;
};

export function PlaylistDestinationScreen({ playlist, pairs, onDone, onBack }: Props) {
  const { t } = useTranslation();
  const { defaults, downloadQueue } = useServices();
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  useKeyboard((key) => {
    if (key.name === "escape") onBack();
  });

  async function handleSubmit(folder: string): Promise<void> {
    const downloadFolder = folder.trim().length === 0 ? defaults.downloadFolder : folder.trim();
    setStatus({ kind: "busy" });

    try {
      const directoryPath = await resolveDownloadDirectory(downloadFolder, playlist.title);
      await ensureWritable(directoryPath);

      const indexWidth = Math.max(2, String(pairs.length).length);
      const resolved = await Promise.all(
        pairs.map(async (pair, index) => {
          const baseName = `${String(index + 1).padStart(indexWidth, "0")} - ${pair.video.title}`;
          const destination = await resolveDestination(
            directoryPath,
            baseName,
            outputExtension(pair.selection),
          );
          return { pair, destination };
        }),
      );

      for (const { pair, destination } of resolved) {
        downloadQueue.enqueue({
          video: pair.video,
          selection: pair.selection,
          destination,
          embedMetadata: defaults.embedMetadata,
        });
      }

      onDone(pairs.length);
    } catch (cause) {
      setStatus({
        kind: "error",
        message: failureMessage(cause, t("playlistDestination.genericError")),
      });
    }
  }

  return (
    <Screen
      title={t("destination.title")}
      subtitle={t("playlistDestination.subtitle", {
        title: playlist.title,
        count: pairs.length,
      })}
      hints={[
        { keys: "Enter", label: t("hints.confirm") },
        { keys: "Esc", label: t("hints.back") },
      ]}
    >
      <Card title={t("playlistDestination.folderCardTitle")}>
        <text fg={palette.dim}>
          {t("playlistDestination.folderHint", { title: playlist.title })}
        </text>
        <input
          focused={status.kind !== "busy"}
          width="100%"
          value={defaults.downloadFolder}
          onSubmit={onSubmitString(handleSubmit)}
          {...inputStyle}
        />
      </Card>
      {status.kind === "busy" ? <Spinner label={t("playlistDestination.preparing")} /> : undefined}
      {status.kind === "error" ? <ErrorLine message={status.message} /> : undefined}
    </Screen>
  );
}
