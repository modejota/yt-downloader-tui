import { useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useTranslation } from "react-i18next";

import type { Video } from "@/domain/media";
import { formatCount, formatDuration } from "@/ui/format-video-summary";
import { truncateText } from "@/ui/truncate";
import { palette } from "@/ui/theme";
import { ErrorLine, Screen, Spinner } from "@/ui/components/chrome";
import { failureMessage } from "@/errors/human-message";
import { useServices } from "@/ui/services-context";

type Props = {
  readonly query: string;
  readonly results: readonly Video[];
  readonly nextPageToken: string | undefined;
  readonly onPick: (video: Video) => void;
  readonly onBack: () => void;
};

export function SearchResultsScreen({ query, results, nextPageToken, onPick, onBack }: Props) {
  const { extraction, defaults } = useServices();
  const { t } = useTranslation();
  // Captured once on mount, on purpose: this screen remounts fresh for every new
  // search, so `results` never needs to re-sync into `items` after that.
  const [items, setItems] = useState<readonly Video[]>(() => results);
  const [token, setToken] = useState<string | undefined>(nextPageToken);
  const [cursor, setCursor] = useState(0);
  const [moreStatus, setMoreStatus] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const { width, height } = useTerminalDimensions();

  // The trailing "load more" row exists while YouTube has another page.
  const rowCount = items.length + (token === undefined ? 0 : 1);

  const visibleRows = Math.max(4, height - 8);
  const windowStart = Math.max(
    0,
    Math.min(cursor - Math.floor(visibleRows / 2), rowCount - visibleRows),
  );
  const visibleItems = items.slice(windowStart, windowStart + visibleRows);
  const loadMoreRowVisible = rowCount > items.length && windowStart + visibleRows > items.length;

  async function loadMore(): Promise<void> {
    if (moreStatus.kind === "loading" || token === undefined) return;
    setMoreStatus({ kind: "loading" });
    const signal = new AbortController().signal;
    try {
      const page = await extraction.search(query, defaults.searchResultsCount, token, signal);
      setItems((current) => {
        const knownIds = new Set(current.map((video) => video.id));
        return [...current, ...page.results.filter((video) => !knownIds.has(video.id))];
      });
      setToken(page.nextPageToken);
      setCursor(items.length);
      setMoreStatus({ kind: "idle" });
    } catch (cause) {
      setMoreStatus({ kind: "error", message: failureMessage(cause, t("home.genericError")) });
    }
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      onBack();
      return;
    }
    if (key.name === "up") {
      setCursor((cursor + rowCount - 1) % rowCount);
      return;
    }
    if (key.name === "down") {
      setCursor((cursor + 1) % rowCount);
      return;
    }
    if (key.name !== "return") return;
    const video = items[cursor];
    if (video === undefined) void loadMore();
    else onPick(video);
  });

  function renderRow(video: Video, index: number) {
    const isCursor = index === cursor;
    const meta = `${formatDuration(video.durationSeconds)} · ${formatCount(video.viewCount)}`;

    const channelBudget = width - 2 - 2 - meta.length - 4;
    const channel = truncateText(video.channelName, Math.max(4, channelBudget - 13));
    const titleBudget = Math.max(10, channelBudget - channel.length - 3);
    const title = truncateText(video.title, titleBudget);

    return (
      <box
        key={video.id}
        style={{
          flexDirection: "row",
          height: 1,
          alignItems: "center",
          paddingLeft: 1,
          backgroundColor: isCursor ? palette.surfaceRaised : "transparent",
        }}
      >
        <text fg={isCursor ? palette.accentBright : "transparent"}>❯ </text>
        <box style={{ flexDirection: "row", flexGrow: 1, paddingRight: 1 }}>
          <text>
            <span fg={isCursor ? palette.text : palette.dim}>{title}</span>
            <span fg={palette.dimmer}> — {channel}</span>
          </text>
        </box>
        <text fg={palette.dimmer}>{meta}</text>
      </box>
    );
  }

  const loadMoreRowActive = cursor >= items.length;

  return (
    <Screen
      title={t("searchResults.title")}
      subtitle={t("searchResults.subtitle", { query, count: items.length })}
      hints={[
        { keys: "↑↓", label: t("hints.move") },
        { keys: "Enter", label: t("hints.open") },
        { keys: "Esc", label: t("hints.back") },
      ]}
    >
      <box style={{ flexDirection: "column", flexGrow: 1 }}>
        {visibleItems.map((video, index) => renderRow(video, windowStart + index))}
        {loadMoreRowVisible ? (
          <box
            style={{
              flexDirection: "row",
              height: 1,
              alignItems: "center",
              paddingLeft: 1,
              backgroundColor: loadMoreRowActive ? palette.surfaceRaised : "transparent",
            }}
          >
            <text fg={loadMoreRowActive ? palette.accentBright : "transparent"}>❯ </text>
            {moreStatus.kind === "loading" ? (
              <Spinner label={t("searchResults.loadingMore")} />
            ) : (
              <text fg={loadMoreRowActive ? palette.gold : palette.dim}>
                ▸ {t("searchResults.loadMore")}
              </text>
            )}
          </box>
        ) : undefined}
      </box>
      {moreStatus.kind === "error" ? (
        <ErrorLine message={moreStatus.message} />
      ) : (
        <text fg={palette.dimmer}>{t("searchResults.hint")}</text>
      )}
    </Screen>
  );
}
