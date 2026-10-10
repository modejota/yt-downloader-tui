import { afterEach, describe, expect, it } from "bun:test";

import type { DownloadJob, DownloadJobState, DownloadQueueSnapshot } from "@/domain/queue";
import type { DownloadQueue } from "@/download-queue/queue";
import { connectQueueStore, dismissLastFinished, useQueueStore } from "@/ui/queue-store";

function job(title: string, state: DownloadJobState): DownloadJob {
  return {
    // SAFETY: test fixture; the id brand only marks provenance and carries no runtime invariant.
    id: title as DownloadJob["id"],
    video: {
      // SAFETY: test fixture; the id brand only marks provenance and carries no runtime invariant.
      id: title as DownloadJob["video"]["id"],
      title,
      channelName: "Channel",
      durationSeconds: 60,
      viewCount: 0,
      likeCount: undefined,
      thumbnailUrl: undefined,
    },
    selection: {
      kind: "audio",
      format: "mp3",
      bitrateKbps: "max",
      qualityMode: "vbr",
      trim: undefined,
    },
    destination: { directoryPath: "/tmp", fileName: `${title}.mp3` },
    embedMetadata: true,
    state,
  };
}

/** A queue whose snapshots the test publishes by hand. */
function manualQueue() {
  let listener: ((snapshot: DownloadQueueSnapshot) => void) | undefined;
  return {
    queue: {
      enqueue() {
        throw new Error("not used in this test");
      },
      cancel() {
        throw new Error("not used in this test");
      },
      subscribe(next) {
        listener = next;
        return () => {
          listener = undefined;
        };
      },
    } satisfies DownloadQueue,
    publish: (jobs: readonly DownloadJob[]) => listener?.({ jobs }),
  };
}

describe("connectQueueStore", () => {
  let disconnect = () => {};

  afterEach(() => {
    disconnect();
    useQueueStore.setState({ snapshot: { jobs: [] }, lastFinished: undefined });
  });

  it("announces each download once, when it finishes, until dismissed", () => {
    const { queue, publish } = manualQueue();
    disconnect = connectQueueStore(queue);

    publish([job("Song", { status: "downloading", bytesReceived: 1, bytesTotal: 2 })]);
    expect(useQueueStore.getState().lastFinished).toBeUndefined();

    publish([job("Song", { status: "completed", outputPath: "/tmp/Song.mp3" })]);
    expect(useQueueStore.getState().lastFinished).toEqual({ outcome: "completed", title: "Song" });

    dismissLastFinished();
    publish([job("Song", { status: "completed", outputPath: "/tmp/Song.mp3" })]);
    expect(useQueueStore.getState().lastFinished).toBeUndefined();

    publish([
      job("Song", { status: "completed", outputPath: "/tmp/Song.mp3" }),
      job("Other", { status: "error", message: "No network" }),
    ]);
    expect(useQueueStore.getState().lastFinished).toEqual({
      outcome: "failed",
      title: "Other",
      message: "No network",
    });
  });
});
