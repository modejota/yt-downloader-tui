import path from "node:path";

import type { MediaSelection, Video } from "@/domain/media";
import type {
  Destination,
  DownloadJob,
  DownloadJobId,
  DownloadJobState,
  DownloadQueueSnapshot,
} from "@/domain/queue";
import type { EmbeddedMetadata, ExtractionService, MediaPipeline } from "@/domain/ports";
import { DomainError } from "@/errors/domain-error";
import { failureMessage } from "@/errors/human-message";
import { i18n } from "@/i18n/index";
import { selectConversionSource } from "@/download-queue/select-conversion-source";
import { realDelay, withNetworkRetry } from "@/download-queue/retry";
import type { Delay } from "@/download-queue/retry";

type DownloadJobRequest = {
  readonly video: Video;
  readonly selection: MediaSelection;
  readonly destination: Destination;
  readonly embedMetadata: boolean;
};

export type Unsubscribe = () => void;

export interface DownloadQueue {
  enqueue(job: DownloadJobRequest): DownloadJobId;
  /** Valid in any state except "completed". No-op otherwise. */
  cancel(id: DownloadJobId): void;
  subscribe(listener: (snapshot: DownloadQueueSnapshot) => void): Unsubscribe;
}

export type DownloadQueueOptions = {
  readonly extraction: ExtractionService;
  readonly mediaPipeline: MediaPipeline;
  readonly maxConcurrentDownloads: number;
  /** Injectable backoff clock; defaults to a real timer. Tests supply a fake to skip real waits. */
  readonly delay?: Delay;
};

function isTerminal(state: DownloadJobState): boolean {
  return state.status === "completed" || state.status === "error" || state.status === "cancelled";
}

function embeddedMetadataFor(job: DownloadJob): EmbeddedMetadata | undefined {
  if (!job.embedMetadata) return undefined;
  return {
    title: job.video.title,
    artist: job.video.channelName,
    thumbnailUrl: job.video.thumbnailUrl,
  };
}

/**
 * The download-queue state machine + concurrency limiter.
 */
export function createDownloadQueue(options: DownloadQueueOptions): DownloadQueue {
  const { extraction, mediaPipeline, maxConcurrentDownloads, delay = realDelay } = options;

  const jobsById = new Map<DownloadJobId, DownloadJob>();
  /** One entry per in-flight job; its size is the number of occupied concurrency slots. */
  const runningJobs = new Map<DownloadJobId, AbortController>();
  const listeners = new Set<(snapshot: DownloadQueueSnapshot) => void>();

  function snapshot(): DownloadQueueSnapshot {
    return { jobs: [...jobsById.values()] };
  }

  function notify(): void {
    const current = snapshot();
    for (const listener of listeners) listener(current);
  }

  /** Terminal states are final: late progress from an aborted job must not resurrect it. */
  function updateJobState(id: DownloadJobId, state: DownloadJobState): void {
    const existing = jobsById.get(id);
    if (existing === undefined || isTerminal(existing.state)) return;
    jobsById.set(id, { ...existing, state });
    notify();
  }

  async function downloadOnce(job: DownloadJob, signal: AbortSignal): Promise<string> {
    updateJobState(job.id, { status: "resolving-formats" });

    const candidates = await extraction.getFormatCandidates(job.video.id, signal);
    const source = selectConversionSource(candidates);
    if (source === undefined) {
      throw new DomainError("format-unavailable", "No audio stream is available for this video.");
    }
    const spec = {
      source,
      selection: job.selection,
      destinationPath: path.join(job.destination.directoryPath, job.destination.fileName),
      metadata: embeddedMetadataFor(job),
    };

    for await (const event of mediaPipeline.convert(spec, signal)) {
      switch (event.stage) {
        case "downloading":
          updateJobState(job.id, {
            status: "downloading",
            bytesReceived: event.bytesReceived,
            bytesTotal: event.bytesTotal,
          });
          break;
        case "converting":
          updateJobState(job.id, { status: "converting", ratio: event.ratio, mode: event.mode });
          break;
        case "tagging":
          updateJobState(job.id, { status: "tagging" });
          break;
        case "done":
          return event.outputPath;
      }
    }

    throw new DomainError(
      "conversion",
      "The conversion pipeline finished without producing a result.",
    );
  }

  async function runJob(job: DownloadJob): Promise<void> {
    const controller = new AbortController();
    runningJobs.set(job.id, controller);

    try {
      const outputPath = await withNetworkRetry(() => downloadOnce(job, controller.signal), delay);
      updateJobState(job.id, { status: "completed", outputPath });
    } catch (cause) {
      updateJobState(job.id, {
        status: "error",
        message: failureMessage(cause, i18n.t("errors.unknown")),
      });
    } finally {
      runningJobs.delete(job.id);
      startNextPendingJob();
    }
  }

  function startNextPendingJob(): void {
    if (runningJobs.size >= maxConcurrentDownloads) return;
    const next = [...jobsById.values()].find((job) => job.state.status === "pending");
    if (next === undefined) return;
    // runJob registers itself in runningJobs and leaves "pending" synchronously, before its first await.
    void runJob(next);
  }

  function enqueue(request: DownloadJobRequest): DownloadJobId {
    // SAFETY: randomUUID mints a fresh, unique string, and this queue is the only issuer of DownloadJobIds.
    const id = crypto.randomUUID() as DownloadJobId;
    jobsById.set(id, { ...request, id, state: { status: "pending" } });
    notify();
    startNextPendingJob();
    return id;
  }

  function cancel(id: DownloadJobId): void {
    runningJobs.get(id)?.abort();
    updateJobState(id, { status: "cancelled" });
  }

  function subscribe(listener: (snapshot: DownloadQueueSnapshot) => void): Unsubscribe {
    listeners.add(listener);
    listener(snapshot());
    return () => listeners.delete(listener);
  }

  return { enqueue, cancel, subscribe };
}
