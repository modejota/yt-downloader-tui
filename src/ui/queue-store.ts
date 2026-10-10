import { create } from "zustand";

import type { DownloadQueue } from "@/download-queue/queue";
import type { DownloadJob, DownloadJobId, DownloadQueueSnapshot } from "@/domain/queue";

/** The latest download to finish, announced on the home screen until the user starts something new. */
export type FinishedDownload =
  | { readonly outcome: "completed"; readonly title: string }
  | { readonly outcome: "failed"; readonly title: string; readonly message: string };

type QueueStoreState = {
  readonly snapshot: DownloadQueueSnapshot;
  readonly lastFinished: FinishedDownload | undefined;
};

export const useQueueStore = create<QueueStoreState>(() => ({
  snapshot: { jobs: [] },
  lastFinished: undefined,
}));

export function connectQueueStore(queue: DownloadQueue): () => void {
  // Jobs reach a terminal state only once, so an unseen terminal job is one that just finished.
  const seenFinishedJobIds = new Set<DownloadJobId>();
  return queue.subscribe((snapshot) => {
    let justFinished: FinishedDownload | undefined;
    for (const job of snapshot.jobs) {
      const finished = toFinishedDownload(job);
      if (finished === undefined || seenFinishedJobIds.has(job.id)) continue;
      seenFinishedJobIds.add(job.id);
      justFinished = finished;
    }
    useQueueStore.setState((current) => ({
      snapshot,
      lastFinished: justFinished ?? current.lastFinished,
    }));
  });
}

export function dismissLastFinished(): void {
  useQueueStore.setState({ lastFinished: undefined });
}

function toFinishedDownload(job: DownloadJob): FinishedDownload | undefined {
  if (job.state.status === "completed") return { outcome: "completed", title: job.video.title };
  if (job.state.status === "error") {
    return { outcome: "failed", title: job.video.title, message: job.state.message };
  }
  return undefined;
}
