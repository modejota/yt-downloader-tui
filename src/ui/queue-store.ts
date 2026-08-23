import { create } from "zustand";

import type { DownloadQueue } from "@/download-queue/queue";
import type { DownloadQueueSnapshot } from "@/domain/queue";

type QueueStoreState = {
  readonly snapshot: DownloadQueueSnapshot;
};

export const useQueueStore = create<QueueStoreState>(() => ({ snapshot: { jobs: [] } }));

export function connectQueueStore(queue: DownloadQueue): () => void {
  return queue.subscribe((snapshot) => useQueueStore.setState({ snapshot }));
}
