import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "react-i18next";

import type { FormatCandidate, MediaSelection, Video } from "@/domain/media";
import type { Destination } from "@/domain/queue";
import {
  checkDiskSpaceFor,
  ensureWritable,
  resolveDestination,
  resolveDownloadDirectory,
} from "@/filesystem/index";
import { outputExtension } from "@/ui/format-options";
import { estimateBytes, mediaDetails } from "@/ui/format-summary";
import { videoSummary } from "@/ui/format-video-summary";
import { inputStyle } from "@/ui/theme";
import { Card, ErrorLine, Screen, Spinner } from "@/ui/components/chrome";
import { failureMessage } from "@/errors/human-message";
import { MediaCard } from "@/ui/components/media-card";
import { onSubmitString } from "@/ui/opentui-input-fix";
import { useServices } from "@/ui/services-context";

type Props = {
  readonly video: Video;
  readonly candidates: readonly FormatCandidate[];
  readonly selection: MediaSelection;
  readonly onConfirm: (destination: Destination) => void;
  readonly onBack: () => void;
};

/** Destination folder, defaulting to the configured downloads folder. */
export function DestinationScreen({ video, candidates, selection, onConfirm, onBack }: Props) {
  const { defaults } = useServices();
  const { t } = useTranslation();
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
      const directoryPath = await resolveDownloadDirectory(downloadFolder, undefined);
      await ensureWritable(directoryPath);
      await checkDiskSpaceFor(directoryPath, estimateBytes(candidates));
      const destination = await resolveDestination(
        directoryPath,
        video.title,
        outputExtension(selection),
      );
      onConfirm(destination);
    } catch (cause) {
      setStatus({ kind: "error", message: failureMessage(cause, t("destination.genericError")) });
    }
  }

  return (
    <Screen
      title={t("destination.title")}
      hints={[
        { keys: "Enter", label: t("hints.confirm") },
        { keys: "Esc", label: t("hints.back") },
      ]}
    >
      <MediaCard
        title={video.title}
        meta={videoSummary(video)}
        details={mediaDetails(video.title, selection, estimateBytes(candidates))}
      />
      <Card title={t("destination.folderCardTitle")}>
        <input
          focused={status.kind !== "busy"}
          width="100%"
          value={defaults.downloadFolder}
          onSubmit={onSubmitString(handleSubmit)}
          {...inputStyle}
        />
      </Card>
      {status.kind === "busy" ? <Spinner label={t("destination.checking")} /> : undefined}
      {status.kind === "error" ? <ErrorLine message={status.message} /> : undefined}
    </Screen>
  );
}
