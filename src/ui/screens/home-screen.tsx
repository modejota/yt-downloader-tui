import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Playlist, Video } from "@/domain/media";
import { toHumanMessage } from "@/errors/human-message";
import { DomainError } from "@/errors/domain-error";
import { parseYoutubeSourceUrl } from "@/extraction/mapping";
import { onSubmitString } from "@/ui/opentui-input-fix";
import { palette, inputStyle } from "@/ui/theme";
import { Card, Spinner, useScreenHints } from "@/ui/components/chrome";
import { useQueueStore } from "@/ui/queue-store";
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

type CompletionNotice = { readonly tone: "ok" | "error"; readonly text: string };

// Reported terminal jobs, kept across HomeScreen remounts so navigating the
// flow and coming back doesn't re-announce an old completion.
const reportedJobIds = new Set<string>();
// The latest completion announcement, so it outlives remounts (unlike the
// "added to queue" notice, which belongs to the flow that produced it).
let lastCompletion: CompletionNotice | undefined;

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
  const [completion, setCompletion] = useState<CompletionNotice | undefined>(lastCompletion);
  const jobs = useQueueStore((state) => state.snapshot.jobs);

  // The queue is empty at startup and jobs only ever reach a terminal state
  // once, so "a terminal job we haven't reported" is exactly "a download
  // that just finished" — announced here instead of the stale enqueued note.
  useEffect(() => {
    for (const job of jobs) {
      const status = job.state.status;
      if (status !== "completed" && status !== "error") continue;
      if (reportedJobIds.has(job.id)) continue;
      reportedJobIds.add(job.id);
      const announcement: CompletionNotice =
        status === "completed"
          ? { tone: "ok", text: t("home.downloadCompleted", { title: job.video.title }) }
          : {
              tone: "error",
              text: t("home.downloadFailed", {
                title: job.video.title,
                message: job.state.message,
              }),
            };
      lastCompletion = announcement;
      setCompletion(announcement);
    }
  }, [jobs, t]);

  useScreenHints([{ keys: "Enter", label: t("hints.submit") }]);

  async function handleSubmit(input: string): Promise<void> {
    const trimmed = input.trim();
    if (trimmed.length === 0) return;

    setStatus({ kind: "busy" });
    lastCompletion = undefined;
    setCompletion(undefined);
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
      const message = cause instanceof DomainError ? toHumanMessage(cause) : t("home.genericError");
      setStatus({ kind: "error", message });
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
        {status.kind === "error" ? (
          <text>
            <span fg={palette.red}>✕ </span>
            <span fg={palette.red}>{status.message}</span>
          </text>
        ) : undefined}
        {status.kind === "idle" && completion !== undefined ? (
          <text>
            <span fg={completion.tone === "ok" ? palette.green : palette.red}>
              {completion.tone === "ok" ? "✓" : "✕"}{" "}
            </span>
            <span fg={palette.dim}>{completion.text}</span>
          </text>
        ) : undefined}
        {status.kind === "idle" && completion === undefined && notice !== undefined ? (
          <text>
            <span fg={palette.green}>✓ </span>
            <span fg={palette.dim}>{notice}</span>
          </text>
        ) : undefined}
      </box>
    </box>
  );
}
