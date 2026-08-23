import { describe, expect, it } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";

import type { Defaults } from "@/domain/config";
import { DEFAULT_SETTINGS } from "@/domain/config";
import type { Playlist, Video } from "@/domain/media";
import type {
  ExtractionService,
  MediaPipeline,
  PlaylistPage,
  ResolvedSource,
  SearchPage,
} from "@/domain/ports";
import type { DownloadQueue } from "@/download-queue/queue";
import { Flow } from "@/ui/app";
import { AppFrame } from "@/ui/components/chrome";
import { ServicesProvider, type Services } from "@/ui/services-context";

const STUB_VIDEO: Video = {
  id: "abc123" as Video["id"],
  title: "Test Video",
  channelName: "Test Channel",
  durationSeconds: 125,
  viewCount: 4200,
  likeCount: 100,
  thumbnailUrl: undefined,
};

const STUB_VIDEO_2: Video = {
  ...STUB_VIDEO,
  id: "def456" as Video["id"],
  title: "Second Video",
};

const STUB_PLAYLIST: Playlist = {
  id: "PL123" as Playlist["id"],
  title: "Test Playlist",
  videoCount: 2,
};

function fakeExtraction(): ExtractionService {
  return {
    resolveSource(): Promise<ResolvedSource> {
      throw new Error("not used in this test");
    },
    search(): Promise<SearchPage> {
      return Promise.resolve({ results: [STUB_VIDEO], nextPageToken: undefined });
    },
    listPlaylistItems(): never {
      throw new Error("not used in this test");
    },
    getFormatCandidates() {
      return Promise.resolve([]);
    },
  };
}

function fakePlaylistExtraction(): ExtractionService {
  return {
    resolveSource(): Promise<ResolvedSource> {
      return Promise.resolve({ kind: "playlist", playlist: STUB_PLAYLIST });
    },
    search(): Promise<SearchPage> {
      throw new Error("not used in this test");
    },
    listPlaylistItems(): Promise<PlaylistPage> {
      return Promise.resolve({
        playlist: STUB_PLAYLIST,
        items: [STUB_VIDEO, STUB_VIDEO_2],
        nextPageToken: undefined,
      });
    },
    getFormatCandidates() {
      return Promise.resolve([]);
    },
  };
}

function fakeMediaPipeline(): MediaPipeline {
  return {
    convert(): AsyncIterable<never> {
      throw new Error("not used in this test");
    },
  };
}

function fakeDownloadQueue(): DownloadQueue {
  return {
    enqueue() {
      throw new Error("not used in this test");
    },
    cancel() {
      throw new Error("not used in this test");
    },
    subscribe() {
      return () => {};
    },
  };
}

const defaults: Defaults = { ...DEFAULT_SETTINGS, downloadFolder: "/tmp/downloads" };

function fakeServices(extraction: ExtractionService = fakeExtraction()): Services {
  return {
    extraction,
    mediaPipeline: fakeMediaPipeline(),
    downloadQueue: fakeDownloadQueue(),
    defaults,
    updateDefaults: () => {
      throw new Error("not used in this test");
    },
  };
}

function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

/**
 * `waitForFrame()` pumps the renderer's own scheduler, not React's — a
 * `Promise.then()` chain (like a screen's async submit handler) needs at
 * least one real tick to resolve before there's anything new to render, and
 * that update lands outside React's `act()` unless we wrap the wait too.
 */
function interact(fireInput: () => void | Promise<void>): Promise<void> {
  return act(async () => {
    await fireInput();
    await flushAsyncWork();
  });
}

describe("Flow", () => {
  it("goes from a search query on Home to the search results screen", async () => {
    const setup = await testRender(
      <AppFrame>
        <ServicesProvider services={fakeServices()}>
          <Flow />
        </ServicesProvider>
      </AppFrame>,
      { width: 80, height: 24 },
    );

    try {
      await setup.renderOnce();
      await interact(async () => {
        await setup.mockInput.typeText("some search query");
        setup.mockInput.pressEnter();
      });

      const frame = await setup.waitForFrame((text) => text.includes("Test Video"));
      expect(frame).toContain("Test Video");
      expect(frame).toContain("Test Channel");
    } finally {
      setup.renderer.destroy();
    }
  });

  it("moves from a picked search result into the format-selection screen", async () => {
    const setup = await testRender(
      <AppFrame>
        <ServicesProvider services={fakeServices()}>
          <Flow />
        </ServicesProvider>
      </AppFrame>,
      { width: 80, height: 24 },
    );

    try {
      await setup.renderOnce();
      await interact(async () => {
        await setup.mockInput.typeText("some search query");
        setup.mockInput.pressEnter();
      });
      await setup.waitForFrame((text) => text.includes("Test Video"));

      await interact(() => setup.mockInput.pressEnter()); // confirm the first (only) search result

      const frame = await setup.waitForFrame((text) => text.includes("Format"));
      expect(frame).toContain("Test Video");
      // The whole decision space is on one screen — no drill-down steps.
      expect(frame).toContain("Format");
      expect(frame).toContain("Quality");
      expect(frame).toContain("Trim");
      expect(frame).toContain("Continue");
    } finally {
      setup.renderer.destroy();
    }
  });

  it("goes from a pasted playlist URL, through item selection, to the format-selection mode prompt", async () => {
    const setup = await testRender(
      <AppFrame>
        <ServicesProvider services={fakeServices(fakePlaylistExtraction())}>
          <Flow />
        </ServicesProvider>
      </AppFrame>,
      { width: 80, height: 24 },
    );

    try {
      await setup.renderOnce();
      await interact(async () => {
        await setup.mockInput.typeText("https://youtube.com/playlist?list=PL123");
        setup.mockInput.pressEnter();
      });

      let frame = await setup.waitForFrame((text) => text.includes("Second Video"));
      expect(frame).toContain("Test Playlist");

      // rows: [video0, video1, select-all, select-none, confirm] — move to "select-all" and toggle it.
      await interact(() => {
        setup.mockInput.pressArrow("down");
        setup.mockInput.pressArrow("down");
        setup.mockInput.pressEnter();
      });

      frame = await setup.waitForFrame((text) => text.includes("2 of 2 selected"));
      expect(frame).toContain("2 of 2 selected");

      // Move from "select-all" to "confirm" (skip "select-none") and confirm.
      await interact(() => {
        setup.mockInput.pressArrow("down");
        setup.mockInput.pressArrow("down");
        setup.mockInput.pressEnter();
      });

      frame = await setup.waitForFrame((text) => text.includes("ENTRIES SELECTED"));
      expect(frame).toContain("2 ENTRIES SELECTED");
      expect(frame).toContain("Same settings to all");
    } finally {
      setup.renderer.destroy();
    }
  });
});
