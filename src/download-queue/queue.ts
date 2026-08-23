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
import { toHumanMessage } from "@/errors/human-message";
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
  const controllersById = new Map<DownloadJobId, AbortController>();
  const listeners = new Set<(snapshot: DownloadQueueSnapshot) => void>();
  let activeCount = 0;

  function notify(): void {
    const snapshot: DownloadQueueSnapshot = { jobs: [...jobsById.values()] };
    for (const listener of listeners) listener(snapshot);
  }

  function updateJobState(id: DownloadJobId, state: DownloadJobState): void {
    const existing = jobsById.get(id);
    if (existing === undefined || isTerminal(existing.state)) return;
    jobsById.set(id, { ...existing, state });
    notify();
  }

  async function processJobOnce(job: DownloadJob, signal: AbortSignal): Promise<string> {
    updateJobState(job.id, { status: "resolving-formats" });

    const candidates = await extraction.getFormatCandidates(job.video.id, signal);
    const source = selectConversionSource(candidates);
    const destinationPath = path.join(job.destination.directoryPath, job.destination.fileName);

    for await (const event of mediaPipeline.convert(
      {
        source,
        selection: job.selection,
        destinationPath,
        metadata: embeddedMetadataFor(job),
      },
      signal,
    )) {
      if (event.stage === "downloading") {
        updateJobState(job.id, {
          status: "downloading",
          bytesReceived: event.bytesReceived,
          bytesTotal: event.bytesTotal,
        });
        continue;
      }
      if (event.stage === "converting") {
        updateJobState(job.id, { status: "converting", ratio: event.ratio, mode: event.mode });
        continue;
      }
      if (event.stage === "tagging") {
        updateJobState(job.id, { status: "tagging" });
        continue;
      }
      return event.outputPath;
    }

    throw new DomainError(
      "conversion",
      "The conversion pipeline finished without producing a result.",
    );
  }

  async function runJob(job: DownloadJob): Promise<void> {
    const controller = new AbortController();
    controllersById.set(job.id, controller);

    try {
      const outputPath = await withNetworkRetry(
        () => processJobOnce(job, controller.signal),
        delay,
      );
      updateJobState(job.id, { status: "completed", outputPath });
    } catch (cause) {
      const message =
        cause instanceof DomainError ? toHumanMessage(cause) : i18n.t("errors.unknown");
      updateJobState(job.id, { status: "error", message });
    } finally {
      controllersById.delete(job.id);
      activeCount -= 1;
      startNextPendingJob();
    }
  }

  function startNextPendingJob(): void {
    if (activeCount >= maxConcurrentDownloads) return;
    const next = [...jobsById.values()].find((job) => job.state.status === "pending");
    if (next === undefined) return;
    activeCount += 1;
    void runJob(next);
  }

  function enqueue(request: DownloadJobRequest): DownloadJobId {
    const id = crypto.randomUUID() as DownloadJobId;
    jobsById.set(id, {
      id,
      video: request.video,
      selection: request.selection,
      destination: request.destination,
      embedMetadata: request.embedMetadata,
      state: { status: "pending" },
    });
    notify();
    startNextPendingJob();
    return id;
  }

  function cancel(id: DownloadJobId): void {
    const job = jobsById.get(id);
    if (job === undefined || isTerminal(job.state)) return;
    controllersById.get(id)?.abort();
    updateJobState(id, { status: "cancelled" });
  }

  function subscribe(listener: (snapshot: DownloadQueueSnapshot) => void): Unsubscribe {
    listeners.add(listener);
    listener({ jobs: [...jobsById.values()] });
    return () => listeners.delete(listener);
  }

  return { enqueue, cancel, subscribe };
}
