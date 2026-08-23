import type { Brand } from "@/domain/brand";
import type { MediaSelection, Video } from "@/domain/media";

export type DownloadJobId = Brand<string, "DownloadJobId">;

export type Destination = {
  readonly directoryPath: string;
  readonly fileName: string;
};

export type DownloadJobState =
  | { readonly status: "pending" }
  | { readonly status: "resolving-formats" }
  | {
      readonly status: "downloading";
      readonly bytesReceived: number;
      readonly bytesTotal: number | undefined;
    }
  | { readonly status: "converting"; readonly ratio: number; readonly mode: "remux" | "transcode" }
  | { readonly status: "tagging" }
  | { readonly status: "completed"; readonly outputPath: string }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "cancelled" };

export type DownloadJob = {
  readonly id: DownloadJobId;
  readonly video: Video;
  readonly selection: MediaSelection;
  readonly destination: Destination;
  readonly embedMetadata: boolean;
  readonly state: DownloadJobState;
};

export type DownloadQueueSnapshot = {
  readonly jobs: readonly DownloadJob[];
};
