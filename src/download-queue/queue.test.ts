import path from "node:path";

import { describe, expect, it } from "bun:test";

import {
  createVideoId,
  type FormatCandidate,
  type MediaSelection,
  type Video,
} from "@/domain/media";
import type {
  DownloadJob,
  DownloadJobId,
  DownloadJobState,
  DownloadQueueSnapshot,
} from "@/domain/queue";
import type { ExtractionService, MediaPipeline, ResolvedSource } from "@/domain/ports";
import type { Delay } from "@/download-queue/retry";
import { DomainError } from "@/errors/domain-error";
import { toHumanMessage } from "@/errors/human-message";
import { createDownloadQueue } from "@/download-queue/queue";
import type { DownloadQueue, Unsubscribe } from "@/download-queue/queue";

const selection: MediaSelection = {
  kind: "audio",
  format: "mp3",
  bitrateKbps: 192,
  qualityMode: undefined,
  trim: undefined,
};

function enqueue(queue: DownloadQueue, videoId: string, fileName: string): DownloadJobId {
  const video: Video = {
    id: createVideoId(videoId),
    title: `Video ${videoId}`,
    channelName: "Channel",
    durationSeconds: 120,
    viewCount: 100,
    likeCount: undefined,
    thumbnailUrl: undefined,
  };
  return queue.enqueue({
    video,
    selection,
    destination: { directoryPath: "/downloads", fileName },
    embedMetadata: false,
  });
}

function audioCandidate(): FormatCandidate {
  return {
    role: "audio-only",
    formatId: "a-1",
    url: "https://example.test/a",
    container: "webm",
    audioCodec: "opus",
    bitrateBps: 128_000,
    approximateSizeBytes: undefined,
  };
}

/** Only `getFormatCandidates` is exercised by the queue; the rest of the port is unused here. */
function notUsed(): never {
  throw new Error("not used by these tests");
}

function extractionWith(
  getFormatCandidates: ExtractionService["getFormatCandidates"],
): ExtractionService {
  return {
    resolveSource: (): Promise<ResolvedSource> => notUsed(),
    search: () => notUsed(),
    listPlaylistItems: () => notUsed(),
    getFormatCandidates,
  };
}

function extractionResolvingTo(candidates: readonly FormatCandidate[]): ExtractionService {
  return extractionWith(() => Promise.resolve(candidates));
}

/** A MediaPipeline whose `convert` immediately yields a fixed downloading/converting/done sequence. */
function scriptedMediaPipeline(): MediaPipeline {
  return {
    async *convert(spec) {
      yield { stage: "downloading", bytesReceived: 0, bytesTotal: 100 };
      yield { stage: "downloading", bytesReceived: 100, bytesTotal: 100 };
      yield { stage: "converting", ratio: 0.5, mode: "transcode" };
      yield { stage: "converting", ratio: 1, mode: "transcode" };
      yield { stage: "done", outputPath: spec.destinationPath };
    },
  };
}

function immediateDelay(record?: number[]): Delay {
  return (milliseconds) => {
    record?.push(milliseconds);
    return Promise.resolve();
  };
}

function waitForStatus(
  queue: DownloadQueue,
  id: DownloadJobId,
  status: DownloadJobState["status"],
): Promise<DownloadJob> {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: Unsubscribe | undefined;

    const finish = (job: DownloadJob): void => {
      if (settled) return;
      settled = true;
      resolve(job);
      unsubscribe?.();
    };

    unsubscribe = queue.subscribe((snapshot: DownloadQueueSnapshot) => {
      const job = snapshot.jobs.find((candidate) => candidate.id === id);
      if (job !== undefined && job.state.status === status) finish(job);
    });
    if (settled) unsubscribe();
  });
}

describe("createDownloadQueue", () => {
  it("drives a job pending -> resolving-formats -> downloading -> converting -> completed", async () => {
    const extraction = extractionResolvingTo([audioCandidate()]);
    const mediaPipeline = scriptedMediaPipeline();
    const statuses: DownloadJobState["status"][] = [];
    const queue = createDownloadQueue({ extraction, mediaPipeline, maxConcurrentDownloads: 1 });

    const id = enqueue(queue, "v1", "out.mp3");
    queue.subscribe((snapshot) => {
      const job = snapshot.jobs.find((candidate) => candidate.id === id);
      if (job !== undefined) statuses.push(job.state.status);
    });

    const completed = await waitForStatus(queue, id, "completed");

    expect(completed.state).toEqual({
      status: "completed",
      outputPath: path.join("/downloads", "out.mp3"),
    });
    expect(statuses).toContain("downloading");
    expect(statuses).toContain("converting");
  });

  it("caps concurrency at maxConcurrentDownloads and starts the next job when a slot frees", async () => {
    const gates = new Map<string, () => void>();
    const startedPaths: string[] = [];
    const extraction = extractionResolvingTo([audioCandidate()]);
    const mediaPipeline: MediaPipeline = {
      async *convert(spec) {
        startedPaths.push(spec.destinationPath);
        yield { stage: "downloading", bytesReceived: 0, bytesTotal: undefined };
        await new Promise<void>((resolve) => gates.set(spec.destinationPath, resolve));
        yield { stage: "done", outputPath: spec.destinationPath };
      },
    };
    const queue = createDownloadQueue({ extraction, mediaPipeline, maxConcurrentDownloads: 2 });

    const [idA, idB, idC] = ["a.mp3", "b.mp3", "c.mp3"].map((fileName) =>
      enqueue(queue, fileName, fileName),
    );
    if (idA === undefined || idB === undefined || idC === undefined) throw new Error("setup");

    await waitForStatus(queue, idA, "downloading");
    await waitForStatus(queue, idB, "downloading");
    const pendingC = await waitForStatus(queue, idC, "pending");

    expect(pendingC.state.status).toBe("pending");
    expect(startedPaths).toHaveLength(2);

    const releaseA = gates.get(path.join("/downloads", "a.mp3"));
    if (releaseA === undefined) throw new Error("gate for a.mp3 missing");
    releaseA();

    await waitForStatus(queue, idA, "completed");
    await waitForStatus(queue, idC, "downloading");
    expect(startedPaths).toHaveLength(3);
  });

  it("retries a network DomainError up to the retry budget and then succeeds", async () => {
    let calls = 0;
    const extraction = extractionWith(() => {
      calls += 1;
      if (calls < 4) return Promise.reject(new DomainError("network", "boom"));
      return Promise.resolve([audioCandidate()]);
    });
    const delays: number[] = [];
    const queue = createDownloadQueue({
      extraction,
      mediaPipeline: scriptedMediaPipeline(),
      maxConcurrentDownloads: 1,
      delay: immediateDelay(delays),
    });

    const id = enqueue(queue, "v1", "out.mp3");
    const completed = await waitForStatus(queue, id, "completed");

    expect(completed.state.status).toBe("completed");
    expect(calls).toBe(4);
    expect(delays).toEqual([2000, 4000, 8000]);
  });

  it("moves to error after exhausting the retry budget on repeated network failures", async () => {
    let calls = 0;
    const extraction = extractionWith(() => {
      calls += 1;
      return Promise.reject(new DomainError("network", "boom"));
    });
    const queue = createDownloadQueue({
      extraction,
      mediaPipeline: scriptedMediaPipeline(),
      maxConcurrentDownloads: 1,
      delay: immediateDelay(),
    });

    const id = enqueue(queue, "v1", "out.mp3");
    const errored = await waitForStatus(queue, id, "error");

    expect(calls).toBe(4);
    expect(errored.state).toEqual({
      status: "error",
      message: toHumanMessage(new DomainError("network", "boom")),
    });
  });

  it("fails immediately without retrying on a non-network DomainError", async () => {
    let calls = 0;
    const extraction = extractionWith(() => {
      calls += 1;
      return Promise.reject(new DomainError("video-unavailable", "gone"));
    });
    const queue = createDownloadQueue({
      extraction,
      mediaPipeline: scriptedMediaPipeline(),
      maxConcurrentDownloads: 1,
      delay: immediateDelay(),
    });

    const id = enqueue(queue, "v1", "out.mp3");
    const errored = await waitForStatus(queue, id, "error");

    expect(calls).toBe(1);
    expect(errored.state).toEqual({
      status: "error",
      message: toHumanMessage(new DomainError("video-unavailable", "gone")),
    });
  });

  it("fails immediately with a generic message on a non-DomainError throw", async () => {
    const extraction = extractionWith(() => Promise.reject(new Error("unexpected")));
    const queue = createDownloadQueue({
      extraction,
      mediaPipeline: scriptedMediaPipeline(),
      maxConcurrentDownloads: 1,
      delay: immediateDelay(),
    });

    const id = enqueue(queue, "v1", "out.mp3");
    const errored = await waitForStatus(queue, id, "error");

    expect(errored.state).toEqual({
      status: "error",
      message: toHumanMessage(new DomainError("unknown", "boom")),
    });
  });

  it("cancels a pending job without ever starting it", async () => {
    const gates = new Map<string, () => void>();
    let getFormatCandidatesCalls = 0;
    const extraction = extractionWith(() => {
      getFormatCandidatesCalls += 1;
      return Promise.resolve([audioCandidate()]);
    });
    const mediaPipeline: MediaPipeline = {
      async *convert(spec) {
        yield { stage: "downloading", bytesReceived: 0, bytesTotal: undefined };
        await new Promise<void>((resolve) => gates.set(spec.destinationPath, resolve));
        yield { stage: "done", outputPath: spec.destinationPath };
      },
    };
    const queue = createDownloadQueue({ extraction, mediaPipeline, maxConcurrentDownloads: 1 });

    const runningId = enqueue(queue, "running", "running.mp3");
    const pendingId = enqueue(queue, "pending", "pending.mp3");
    await waitForStatus(queue, runningId, "downloading");

    queue.cancel(pendingId);
    const cancelled = await waitForStatus(queue, pendingId, "cancelled");

    expect(cancelled.state).toEqual({ status: "cancelled" });
    expect(getFormatCandidatesCalls).toBe(1);
  });

  it("cancels an actively downloading job and aborts its signal", async () => {
    let capturedSignal: AbortSignal | undefined;
    const extraction = extractionResolvingTo([audioCandidate()]);
    const mediaPipeline: MediaPipeline = {
      async *convert(spec, signal) {
        capturedSignal = signal;
        yield { stage: "downloading", bytesReceived: 0, bytesTotal: undefined };
        await new Promise<void>(() => {
          // Never resolves on its own; only cancellation is expected to move this job forward.
        });
        yield { stage: "done", outputPath: spec.destinationPath };
      },
    };
    const queue = createDownloadQueue({ extraction, mediaPipeline, maxConcurrentDownloads: 1 });

    const id = enqueue(queue, "v1", "out.mp3");
    await waitForStatus(queue, id, "downloading");

    queue.cancel(id);
    const cancelled = await waitForStatus(queue, id, "cancelled");

    expect(cancelled.state).toEqual({ status: "cancelled" });
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("does nothing when cancelling an unknown or already-completed job", async () => {
    const extraction = extractionResolvingTo([audioCandidate()]);
    const queue = createDownloadQueue({
      extraction,
      mediaPipeline: scriptedMediaPipeline(),
      maxConcurrentDownloads: 1,
    });

    const id = enqueue(queue, "v1", "out.mp3");
    const completed = await waitForStatus(queue, id, "completed");
    expect(completed.state.status).toBe("completed");

    expect(() => queue.cancel(id)).not.toThrow();
    // SAFETY: deliberately forges an id the queue never issued, to exercise the unknown-id guard.
    expect(() => queue.cancel("does-not-exist" as DownloadJobId)).not.toThrow();
  });

  it("notifies every subscriber independently and stops after unsubscribe", async () => {
    const extraction = extractionResolvingTo([audioCandidate()]);
    const queue = createDownloadQueue({
      extraction,
      mediaPipeline: scriptedMediaPipeline(),
      maxConcurrentDownloads: 1,
    });

    const snapshotsA: DownloadQueueSnapshot[] = [];
    const snapshotsB: DownloadQueueSnapshot[] = [];
    const unsubscribeA = queue.subscribe((snapshot) => snapshotsA.push(snapshot));
    const unsubscribeB = queue.subscribe((snapshot) => snapshotsB.push(snapshot));

    expect(snapshotsA).toHaveLength(1);
    expect(snapshotsB).toHaveLength(1);

    const id = enqueue(queue, "v1", "out.mp3");
    await waitForStatus(queue, id, "completed");

    expect(snapshotsA.length).toBeGreaterThan(1);
    expect(snapshotsA.length).toBe(snapshotsB.length);

    unsubscribeA();
    const countAAfterUnsubscribe = snapshotsA.length;
    const id2 = enqueue(queue, "v2", "out2.mp3");
    await waitForStatus(queue, id2, "completed");

    expect(snapshotsA.length).toBe(countAAfterUnsubscribe);
    expect(snapshotsB.length).toBeGreaterThan(countAAfterUnsubscribe);

    unsubscribeB();
  });
});
