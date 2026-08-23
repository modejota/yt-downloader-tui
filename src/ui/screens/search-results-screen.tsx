import { useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useTranslation } from "react-i18next";

import type { Video } from "@/domain/media";
import { DomainError } from "@/errors/domain-error";
import { toHumanMessage } from "@/errors/human-message";
import { formatCount, formatDuration } from "@/ui/format-video-summary";
import { truncateText } from "@/ui/truncate";
import { palette } from "@/ui/theme";
import { Screen, Spinner } from "@/ui/components/chrome";
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const { width, height } = useTerminalDimensions();
  const latestRequestId = useRef(0);

  const hasMore = token !== undefined && !loadingMore;
  const rowCount = items.length + (hasMore || loadingMore ? 1 : 0);

  const visibleRows = Math.max(4, height - 8);
  const windowStart = Math.max(
    0,
    Math.min(cursor - Math.floor(visibleRows / 2), rowCount - visibleRows),
  );
  const visibleItems = items.slice(windowStart, windowStart + visibleRows);
  const extraRowVisible = rowCount > items.length && windowStart + visibleRows > items.length;

  function clampCursor(next: number): void {
    setCursor(Math.min(Math.max(0, next), rowCount - 1));
  }

  async function loadMore(): Promise<void> {
    if (loadingMore || token === undefined) return;
    const requestId = ++latestRequestId.current;
    setLoadingMore(true);
    setLoadError(undefined);
    const signal = new AbortController().signal;
    try {
      const page = await extraction.search(query, defaults.searchResultsCount, token, signal);
      if (latestRequestId.current !== requestId) return;
      const knownIds = new Set(items.map((video) => video.id));
      setItems((current) => [
        ...current,
        ...page.results.filter((video) => !knownIds.has(video.id)),
      ]);
      setToken(page.nextPageToken);
      setCursor(items.length);
    } catch (cause) {
      if (latestRequestId.current !== requestId) return;
      setLoadError(cause instanceof DomainError ? toHumanMessage(cause) : t("home.genericError"));
    } finally {
      if (latestRequestId.current === requestId) setLoadingMore(false);
    }
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      onBack();
      return;
    }
    if (key.name === "up") {
      clampCursor((cursor + rowCount - 1) % rowCount);
      return;
    }
    if (key.name === "down") {
      clampCursor((cursor + 1) % rowCount);
      return;
    }
    if (key.name === "return") {
      if (cursor >= items.length) {
        void loadMore();
      } else {
        const video = items[cursor];
        if (video !== undefined) onPick(video);
      }
    }
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

  const extraRowActive = cursor >= items.length;

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
        {extraRowVisible ? (
          <box
            style={{
              flexDirection: "row",
              height: 1,
              alignItems: "center",
              paddingLeft: 1,
              backgroundColor: extraRowActive ? palette.surfaceRaised : "transparent",
            }}
          >
            <text fg={extraRowActive ? palette.accentBright : "transparent"}>❯ </text>
            {loadingMore ? (
              <Spinner label={t("searchResults.loadingMore")} />
            ) : (
              <text fg={extraRowActive ? palette.gold : palette.dim}>
                ▸ {t("searchResults.loadMore")}
              </text>
            )}
          </box>
        ) : undefined}
      </box>
      {loadError !== undefined ? (
        <text>
          <span fg={palette.red}>✕ </span>
          <span fg={palette.red}>{loadError}</span>
        </text>
      ) : (
        <text fg={palette.dimmer}>{t("searchResults.hint")}</text>
      )}
    </Screen>
  );
}
