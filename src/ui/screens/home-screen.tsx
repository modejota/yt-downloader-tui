import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Playlist, Video } from "@/domain/media";
import { parseYoutubeSourceUrl } from "@/extraction/mapping";
import { onSubmitString } from "@/ui/opentui-input-fix";
import { palette, inputStyle } from "@/ui/theme";
import { Card, ErrorLine, Spinner, useScreenHints } from "@/ui/components/chrome";
import { failureMessage } from "@/errors/human-message";
import { dismissLastFinished, useQueueStore, type FinishedDownload } from "@/ui/queue-store";
import { useServices } from "@/ui/services-context";

type Props = {
  readonly notice: string | undefined;
  readonly onVideoResolved: (video: Video) => void;
  readonly onPlaylistResolved: (playlist: Playlist) => void;
  readonly onSearchResults: (
    query: string,
    results: readonly Video[],
    nextPageToken: string | undefined,
  ) => void;
};

/** A single input doubles as "paste a URL" and "search", auto-detected. */
export function HomeScreen({
  notice,
  onVideoResolved,
  onPlaylistResolved,
  onSearchResults,
}: Props) {
  const { extraction, defaults } = useServices();
  const { t } = useTranslation();
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  // Announced instead of the stale "added to queue" notice, which belongs to the flow that produced it.
  const lastFinished = useQueueStore((state) => state.lastFinished);

  useScreenHints([{ keys: "Enter", label: t("hints.submit") }]);

  async function handleSubmit(input: string): Promise<void> {
    const trimmed = input.trim();
    if (trimmed.length === 0) return;

    setStatus({ kind: "busy" });
    dismissLastFinished();
    const signal = new AbortController().signal;

    try {
      if (parseYoutubeSourceUrl(trimmed) !== undefined) {
        const resolved = await extraction.resolveSource(trimmed, signal);
        if (resolved.kind === "playlist") {
          onPlaylistResolved(resolved.playlist);
          return;
        }
        onVideoResolved(resolved.video);
        return;
      }

      const page = await extraction.search(trimmed, defaults.searchResultsCount, undefined, signal);
      if (page.results.length === 0) {
        setStatus({ kind: "error", message: t("home.noResults") });
        return;
      }
      onSearchResults(trimmed, page.results, page.nextPageToken);
    } catch (cause) {
      setStatus({ kind: "error", message: failureMessage(cause, t("home.genericError")) });
    }
  }

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 2,
      }}
    >
      <box style={{ flexDirection: "column", width: "80%", gap: 1 }}>
        <Card>
          <text fg={palette.text}>{t("home.cardTitle")}</text>
          <input
            focused={status.kind !== "busy"}
            width="100%"
            placeholder={t("home.placeholder")}
            onSubmit={onSubmitString(handleSubmit)}
            {...inputStyle}
          />
        </Card>
        <box style={{ flexDirection: "column", paddingLeft: 1, gap: 0 }}>
          <text fg={palette.dimmer}>▸ {t("home.tipUrl")}</text>
          <text fg={palette.dimmer}>▸ {t("home.tipSearch")}</text>
        </box>
        {status.kind === "busy" ? <Spinner label={t("home.searching")} /> : undefined}
        {status.kind === "error" ? <ErrorLine message={status.message} /> : undefined}
        {status.kind === "idle" && lastFinished !== undefined ? (
          <FinishedNotice finished={lastFinished} />
        ) : undefined}
        {status.kind === "idle" && lastFinished === undefined && notice !== undefined ? (
          <text>
            <span fg={palette.green}>✓ </span>
            <span fg={palette.dim}>{notice}</span>
          </text>
        ) : undefined}
      </box>
    </box>
  );
}

function FinishedNotice({ finished }: { readonly finished: FinishedDownload }) {
  const { t } = useTranslation();
  if (finished.outcome === "completed") {
    return (
      <text>
        <span fg={palette.green}>✓ </span>
        <span fg={palette.dim}>{t("home.downloadCompleted", { title: finished.title })}</span>
      </text>
    );
  }
  return (
    <text>
      <span fg={palette.red}>✕ </span>
      <span fg={palette.dim}>
        {t("home.downloadFailed", { title: finished.title, message: finished.message })}
      </span>
    </text>
  );
}
