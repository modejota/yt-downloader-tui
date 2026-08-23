import type { FormatCandidate, MediaSelection, Playlist, Video } from "@/domain/media";
import type { VideoSelectionPair } from "@/ui/screens/playlist-format-flow";

/**
 * The navigable screens up to enqueueing a job. Once a job is enqueued, it
 * stops being part of this navigation — its progress lives in the
 * persistent queue panel/detail screen instead
 */
export type FlowState =
  | { readonly screen: "home"; readonly notice: string | undefined }
  | {
      readonly screen: "search-results";
      readonly query: string;
      readonly results: readonly Video[];
      readonly nextPageToken: string | undefined;
    }
  | { readonly screen: "format-selection"; readonly video: Video }
  | {
      readonly screen: "destination";
      readonly video: Video;
      readonly candidates: readonly FormatCandidate[];
      readonly selection: MediaSelection;
    }
  | { readonly screen: "playlist-items"; readonly playlist: Playlist }
  | {
      readonly screen: "playlist-format";
      readonly playlist: Playlist;
      readonly videos: readonly Video[];
    }
  | {
      readonly screen: "playlist-destination";
      readonly playlist: Playlist;
      readonly pairs: readonly VideoSelectionPair[];
    };

export const HOME_SCREEN: FlowState = { screen: "home", notice: undefined };
