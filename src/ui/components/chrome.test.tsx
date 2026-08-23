import { describe, expect, it } from "bun:test";
import { testRender } from "@opentui/react/test-utils";

import type { Defaults } from "@/domain/config";
import { DEFAULT_SETTINGS } from "@/domain/config";
import type { DownloadJob } from "@/domain/queue";
import type { ExtractionService, MediaPipeline } from "@/domain/ports";
import type { DownloadQueue } from "@/download-queue/queue";
import { useQueueStore } from "@/ui/queue-store";
import { AppFrame } from "@/ui/components/chrome";
import { QueuePanel } from "@/ui/components/queue-panel";
import { SettingsScreen } from "@/ui/screens/settings-screen";
import { ServicesProvider, type Services } from "@/ui/services-context";

function fakeServices(): Services {
  const unusedExtraction = {
    resolveSource() {
      throw new Error("not used in this test");
    },
    search() {
      throw new Error("not used in this test");
    },
    listPlaylistItems() {
      throw new Error("not used in this test");
    },
    getFormatCandidates() {
      return Promise.resolve([]);
    },
  } satisfies ExtractionService;
  const unusedPipeline = {
    convert() {
      throw new Error("not used in this test");
    },
  } satisfies MediaPipeline;
  const unusedQueue = {
    enqueue() {
      throw new Error("not used in this test");
    },
    cancel() {
      throw new Error("not used in this test");
    },
    subscribe() {
      return () => {};
    },
  } satisfies DownloadQueue;
  const defaults: Defaults = { ...DEFAULT_SETTINGS, downloadFolder: "/tmp/downloads" };
  return {
    extraction: unusedExtraction,
    mediaPipeline: unusedPipeline,
    downloadQueue: unusedQueue,
    defaults,
    updateDefaults: () => {
      throw new Error("not used in this test");
    },
  };
}

const STUB_JOB: DownloadJob = {
  id: "job-1" as DownloadJob["id"],
  video: {
    id: "abc123" as DownloadJob["video"]["id"],
    title: "Downloading Video",
    channelName: "Test Channel",
    durationSeconds: 125,
    viewCount: 4200,
    likeCount: undefined,
    thumbnailUrl: undefined,
  },
  selection: {
    kind: "audio",
    format: "mp3",
    bitrateKbps: 320,
    qualityMode: "vbr",
    trim: undefined,
  },
  destination: { directoryPath: "/tmp/downloads", fileName: "song.mp3" },
  embedMetadata: true,
  state: { status: "downloading", bytesReceived: 50, bytesTotal: 100 },
};

describe("app chrome", () => {
  it("renders Settings with every setting visible on one screen", async () => {
    const setup = await testRender(
      <AppFrame>
        <ServicesProvider services={fakeServices()}>
          <SettingsScreen onBack={() => {}} />
        </ServicesProvider>
      </AppFrame>,
      { width: 100, height: 40 },
    );

    try {
      await setup.renderOnce();
      const frame = await setup.waitForFrame((text) => text.includes("Settings"));
      // All groups and a sample of rows are on screen at once — no drill-down.
      expect(frame).toContain("GENERAL");
      expect(frame).toContain("DEFAULT DOWNLOAD");
      expect(frame).toContain("DOWNLOADS");
      expect(frame).toContain("ABOUT");
      expect(frame).toContain("Language");
      expect(frame).toContain("Audio format");
      expect(frame).toContain("Audio quality");
      expect(frame).toContain("Queue panel");
      expect(frame).toContain("Changes save automatically.");
      // The header brand and status bar belong to every screen.
      expect(frame).toContain("yt-downloader-tui");
      expect(frame).toContain("[↑↓]");
    } finally {
      setup.renderer.destroy();
    }
  });

  it("renders the persistent queue panel with a live job", async () => {
    useQueueStore.setState({ snapshot: { jobs: [STUB_JOB] } });
    const setup = await testRender(
      <AppFrame>
        <QueuePanel position="bottom" />
      </AppFrame>,
      { width: 100, height: 20 },
    );

    try {
      await setup.renderOnce();
      const frame = await setup.waitForFrame((text) => text.includes("Downloading Video"));
      expect(frame).toContain("Downloads (1)");
      expect(frame).toContain("50%");
    } finally {
      // Unmount before resetting the shared store: resetting it first, while
      // QueuePanel is still subscribed, updates it outside of React's act().
      setup.renderer.destroy();
      useQueueStore.setState({ snapshot: { jobs: [] } });
    }
  });
});
