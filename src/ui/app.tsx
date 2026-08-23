import { useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "react-i18next";

import { loadDefaults, saveDefaults } from "@/config/index";
import { createDownloadQueue } from "@/download-queue/queue";
import { createYoutubeExtractionService } from "@/extraction/index";
import { applyLanguage } from "@/i18n/index";
import { createMediaPipeline } from "@/media-pipeline/index";
import { palette } from "@/ui/theme";
import { HOME_SCREEN, type FlowState } from "@/ui/flow";
import { ServicesProvider, useServices, type Services } from "@/ui/services-context";
import { connectQueueStore } from "@/ui/queue-store";
import { AppFrame, Spinner } from "@/ui/components/chrome";
import { QueuePanel } from "@/ui/components/queue-panel";
import { HomeScreen } from "@/ui/screens/home-screen";
import { SearchResultsScreen } from "@/ui/screens/search-results-screen";
import { FormatSelectionScreen } from "@/ui/screens/format-selection-screen";
import { DestinationScreen } from "@/ui/screens/destination-screen";
import { QueueDetailScreen } from "@/ui/screens/queue-detail-screen";
import { PlaylistItemsScreen } from "@/ui/screens/playlist-items-screen";
import { PlaylistFormatFlow } from "@/ui/screens/playlist-format-flow";
import { PlaylistDestinationScreen } from "@/ui/screens/playlist-destination-screen";
import { SettingsScreen } from "@/ui/screens/settings-screen";
import { LegalNoticeScreen } from "@/ui/screens/legal-notice-screen";

const FLOW_ELEMENT = <Flow />;

export function App() {
  const [services, setServices] = useState<Services | undefined>(undefined);

  useEffect(() => {
    Promise.all([loadDefaults(), createYoutubeExtractionService()]).then(
      async ([defaults, extraction]) => {
        await applyLanguage(defaults.language);
        const mediaPipeline = createMediaPipeline();
        const downloadQueue = createDownloadQueue({
          extraction,
          mediaPipeline,
          maxConcurrentDownloads: defaults.maxConcurrentDownloads,
        });
        connectQueueStore(downloadQueue);
        setServices({
          defaults,
          extraction,
          mediaPipeline,
          downloadQueue,
          updateDefaults: (updated) => {
            void applyLanguage(updated.language);
            setServices((current) =>
              current === undefined ? current : { ...current, defaults: updated },
            );
          },
        });
      },
    );
  }, []);

  return (
    <AppFrame>
      {services === undefined ? (
        <StartingUp />
      ) : (
        <ServicesProvider services={services}>
          <Onboarding />
        </ServicesProvider>
      )}
    </AppFrame>
  );
}

function StartingUp() {
  const { t } = useTranslation();
  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 1,
      }}
    >
      <text>
        <span fg={palette.accent}>▶ </span>
        <span fg={palette.text}>{t("app.title")}</span>
      </text>
      <text fg={palette.dimmer}>{t("app.tagline")}</text>
      <Spinner label={t("app.starting")} />
    </box>
  );
}

/** Shows the first-launch legal notice before anything else, once. */
function Onboarding() {
  const { defaults, updateDefaults } = useServices();

  if (!defaults.hasSeenLegalNotice) {
    return (
      <LegalNoticeScreen
        onContinue={() => {
          void saveDefaults({ hasSeenLegalNotice: true }).then(updateDefaults);
        }}
      />
    );
  }

  return <Shell />;
}

type Overlay = "none" | "queue" | "settings";

function Shell() {
  const { defaults } = useServices();
  const [overlay, setOverlay] = useState<Overlay>("none");

  useKeyboard((key) => {
    if (!key.ctrl) return;
    if (key.name === "q") setOverlay((current) => (current === "queue" ? "none" : "queue"));
    if (key.name === "s") setOverlay((current) => (current === "settings" ? "none" : "settings"));
  });

  if (overlay === "queue") {
    return <QueueDetailScreen onClose={() => setOverlay("none")} />;
  }
  if (overlay === "settings") {
    return <SettingsScreen onBack={() => setOverlay("none")} />;
  }

  const position = defaults.queuePanelPosition;
  const isSideways = position === "left" || position === "right";
  const panel = <QueuePanel position={position} />;

  return (
    <box style={{ flexDirection: isSideways ? "row" : "column", flexGrow: 1 }}>
      {position === "top" || position === "left" ? panel : undefined}
      <box style={{ flexGrow: 1, flexDirection: "column" }}>{FLOW_ELEMENT}</box>
      {position === "bottom" || position === "right" ? panel : undefined}
    </box>
  );
}

export function Flow() {
  const { downloadQueue, defaults } = useServices();
  const { t } = useTranslation();
  const [flow, setFlow] = useState<FlowState>(HOME_SCREEN);

  if (flow.screen === "home") {
    return (
      <HomeScreen
        notice={flow.notice}
        onVideoResolved={(video) => setFlow({ screen: "format-selection", video })}
        onPlaylistResolved={(playlist) => setFlow({ screen: "playlist-items", playlist })}
        onSearchResults={(query, results, nextPageToken) =>
          setFlow({ screen: "search-results", query, results, nextPageToken })
        }
      />
    );
  }

  if (flow.screen === "search-results") {
    return (
      <SearchResultsScreen
        query={flow.query}
        results={flow.results}
        nextPageToken={flow.nextPageToken}
        onPick={(video) => setFlow({ screen: "format-selection", video })}
        onBack={() => setFlow(HOME_SCREEN)}
      />
    );
  }

  if (flow.screen === "format-selection") {
    return (
      <FormatSelectionScreen
        video={flow.video}
        onConfirm={(candidates, selection) =>
          setFlow({ screen: "destination", video: flow.video, candidates, selection })
        }
        onBack={() => setFlow(HOME_SCREEN)}
      />
    );
  }

  if (flow.screen === "destination") {
    const { video, selection } = flow;
    return (
      <DestinationScreen
        video={video}
        candidates={flow.candidates}
        selection={selection}
        onConfirm={(destination) => {
          downloadQueue.enqueue({
            video,
            selection,
            destination,
            embedMetadata: defaults.embedMetadata,
          });
          setFlow({ screen: "home", notice: t("app.videoEnqueued", { title: video.title }) });
        }}
        onBack={() => setFlow({ screen: "format-selection", video })}
      />
    );
  }

  if (flow.screen === "playlist-items") {
    return (
      <PlaylistItemsScreen
        playlist={flow.playlist}
        onConfirm={(videos) =>
          setFlow({ screen: "playlist-format", playlist: flow.playlist, videos })
        }
        onBack={() => setFlow(HOME_SCREEN)}
      />
    );
  }

  if (flow.screen === "playlist-format") {
    return (
      <PlaylistFormatFlow
        videos={flow.videos}
        onConfirm={(pairs) =>
          setFlow({ screen: "playlist-destination", playlist: flow.playlist, pairs })
        }
        onBack={() => setFlow({ screen: "playlist-items", playlist: flow.playlist })}
      />
    );
  }

  return (
    <PlaylistDestinationScreen
      playlist={flow.playlist}
      pairs={flow.pairs}
      onDone={(count) =>
        setFlow({
          screen: "home",
          notice: t("app.playlistEnqueued", { count, playlistTitle: flow.playlist.title }),
        })
      }
      onBack={() =>
        setFlow({
          screen: "playlist-format",
          playlist: flow.playlist,
          videos: flow.pairs.map((pair) => pair.video),
        })
      }
    />
  );
}
