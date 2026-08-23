import { useCallback, useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "react-i18next";

import type { Playlist, Video } from "@/domain/media";
import { DomainError } from "@/errors/domain-error";
import { toHumanMessage } from "@/errors/human-message";
import { palette, selectStyle } from "@/ui/theme";
import { formatPlaylistItemSummary } from "@/ui/format-video-summary";
import { Screen, Spinner } from "@/ui/components/chrome";
import { useServices } from "@/ui/services-context";

type Row =
  | { readonly kind: "video"; readonly video: Video }
  | { readonly kind: "select-all" }
  | { readonly kind: "select-none" }
  | { readonly kind: "load-more" }
  | { readonly kind: "confirm" };

type Props = {
  readonly playlist: Playlist;
  readonly onConfirm: (videos: readonly Video[]) => void;
  readonly onBack: () => void;
};

/** Lists a playlist's entries and lets the user pick which to download. */
export function PlaylistItemsScreen({ playlist, onConfirm, onBack }: Props) {
  const { t } = useTranslation();
  const { extraction } = useServices();
  const [items, setItems] = useState<readonly Video[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [checked, setChecked] = useState<ReadonlySet<Video["id"]>>(new Set());
  const [status, setStatus] = useState<
    { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [notice, setNotice] = useState<string | undefined>(undefined);

  useKeyboard((key) => {
    if (key.name === "escape") onBack();
  });

  const loadPage = useCallback(
    (pageToken: string | undefined): void => {
      setStatus({ kind: "loading" });
      const signal = new AbortController().signal;
      extraction.listPlaylistItems(playlist.id, pageToken, signal).then(
        (page) => {
          setItems((current) => [...current, ...page.items]);
          setNextPageToken(page.nextPageToken);
          setStatus({ kind: "ready" });
        },
        (cause: unknown) => {
          const message =
            cause instanceof DomainError ? toHumanMessage(cause) : t("playlistItems.loadError");
          setStatus({ kind: "error", message });
        },
      );
    },
    [playlist.id, extraction, t],
  );

  useEffect(() => {
    loadPage(undefined);
    // Fetching the first page is this screen's one-time setup, tied to `playlist`.
  }, [loadPage]);

  if (status.kind === "loading" && items.length === 0) {
    return (
      <Screen title={playlist.title} hints={[]}>
        <Spinner label={t("playlistItems.loading")} />
      </Screen>
    );
  }
  if (status.kind === "error") {
    return (
      <Screen title={playlist.title} hints={[]}>
        <text>
          <span fg={palette.red}>✕ </span>
          <span fg={palette.red}>{status.message}</span>
        </text>
      </Screen>
    );
  }

  const rows: readonly Row[] = [
    ...items.map((video): Row => ({ kind: "video", video })),
    { kind: "select-all" },
    { kind: "select-none" },
    ...(nextPageToken !== undefined ? [{ kind: "load-more" } as const] : []),
    { kind: "confirm" },
  ];

  return (
    <Screen
      title={playlist.title}
      subtitle={
        t("playlistItems.counter", { selected: checked.size, total: items.length }) +
        (nextPageToken !== undefined && playlist.videoCount > items.length
          ? `  ·  ${t("playlistItems.moreInPlaylist", { count: playlist.videoCount })}`
          : "")
      }
      hints={[
        { keys: "↑↓", label: t("hints.move") },
        { keys: "Enter", label: t("hints.toggle") },
        { keys: "Esc", label: t("hints.back") },
      ]}
    >
      <select
        focused
        width="100%"
        // Each option renders name + description on two rows; +1 for the scroll indicator.
        height={Math.min(rows.length * 2 + 1, 21)}
        options={rows.map((row) => {
          if (row.kind === "video") {
            return {
              name: `${checked.has(row.video.id) ? "◉" : "○"} ${row.video.title}`,
              description: formatPlaylistItemSummary(row.video),
            };
          }
          if (row.kind === "select-all") {
            return { name: t("playlistItems.selectAll"), description: "" };
          }
          if (row.kind === "select-none") {
            return { name: t("playlistItems.selectNone"), description: "" };
          }
          if (row.kind === "load-more") {
            return { name: t("playlistItems.loadMore"), description: "" };
          }
          return {
            name: t("playlistItems.continueWith", { count: checked.size }),
            description: "",
          };
        })}
        // react-doctor-disable-next-line react-doctor/no-unknown-property -- real OpenTUI `Select` prop (@opentui/core/renderables/Select.d.ts), not an unrecognized DOM attribute
        showScrollIndicator
        {...selectStyle}
        onSelect={(index) => {
          const row = rows[index];
          if (row === undefined) return;
          if (row.kind === "video") {
            setChecked((current) => {
              const next = new Set(current);
              if (next.has(row.video.id)) next.delete(row.video.id);
              else next.add(row.video.id);
              return next;
            });
            return;
          }
          if (row.kind === "select-all") {
            setChecked(new Set(items.map((video) => video.id)));
            return;
          }
          if (row.kind === "select-none") {
            setChecked(new Set());
            return;
          }
          if (row.kind === "load-more") {
            loadPage(nextPageToken);
            return;
          }
          const selected = items.filter((video) => checked.has(video.id));
          if (selected.length === 0) {
            setNotice(t("playlistItems.selectAtLeastOne"));
            return;
          }
          onConfirm(selected);
        }}
      />
      {status.kind === "loading" ? <Spinner label={t("playlistItems.loadingMore")} /> : undefined}
      {notice !== undefined ? (
        <text>
          <span fg={palette.red}>✕ </span>
          <span fg={palette.red}>{notice}</span>
        </text>
      ) : undefined}
    </Screen>
  );
}
