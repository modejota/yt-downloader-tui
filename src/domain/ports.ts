import type {
  FormatCandidate,
  MediaSelection,
  Playlist,
  PlaylistId,
  Video,
  VideoId,
} from "@/domain/media";

export type SearchPage = {
  readonly results: readonly Video[];
  readonly nextPageToken: string | undefined;
};

export type PlaylistPage = {
  readonly playlist: Playlist;
  readonly items: readonly Video[];
  readonly nextPageToken: string | undefined;
};

export type ResolvedSource =
  | { readonly kind: "video"; readonly video: Video }
  | { readonly kind: "playlist"; readonly playlist: Playlist };

export interface ExtractionService {
  resolveSource(input: string, signal: AbortSignal): Promise<ResolvedSource>;
  /** `pageToken` continues a previous page (see `SearchPage.nextPageToken`). */
  search(
    query: string,
    resultCount: number,
    pageToken: string | undefined,
    signal: AbortSignal,
  ): Promise<SearchPage>;
  listPlaylistItems(
    playlistId: PlaylistId,
    pageToken: string | undefined,
    signal: AbortSignal,
  ): Promise<PlaylistPage>;
  /** Audio-bearing candidates only (progressive or audio-only). */
  getFormatCandidates(videoId: VideoId, signal: AbortSignal): Promise<readonly FormatCandidate[]>;
}

export type ConversionSource = { readonly role: "combined"; readonly format: FormatCandidate };

export type EmbeddedMetadata = {
  readonly title: string;
  readonly artist: string;
  readonly thumbnailUrl: string | undefined;
};

export type ConversionSpec = {
  readonly source: ConversionSource;
  readonly selection: MediaSelection;
  readonly destinationPath: string;
  readonly metadata: EmbeddedMetadata | undefined;
};

export type ConversionProgress =
  | {
      readonly stage: "downloading";
      readonly bytesReceived: number;
      readonly bytesTotal: number | undefined;
    }
  | { readonly stage: "converting"; readonly ratio: number; readonly mode: "remux" | "transcode" }
  | { readonly stage: "tagging" }
  | { readonly stage: "done"; readonly outputPath: string };

export interface MediaPipeline {
  convert(spec: ConversionSpec, signal: AbortSignal): AsyncIterable<ConversionProgress>;
}
