import type { Brand } from "@/domain/brand";

export type VideoId = Brand<string, "VideoId">;
export type PlaylistId = Brand<string, "PlaylistId">;

export type Video = {
  readonly id: VideoId;
  readonly title: string;
  readonly channelName: string;
  readonly durationSeconds: number;
  readonly viewCount: number;
  readonly likeCount: number | undefined;
  readonly thumbnailUrl: string | undefined;
};

export type Playlist = {
  readonly id: PlaylistId;
  readonly title: string;
  readonly videoCount: number;
};

export type SourceContainer = "mp4" | "webm";
export type SourceVideoCodec = "av1" | "h264" | "h265" | "vp9";
export type SourceAudioCodec = "aac" | "opus";

/**
 * A concrete downloadable stream YouTube offers for a Video. The app only
 * ever produces audio, so the pipeline only consumes the audio track
 */
export type FormatCandidate =
  | {
      readonly role: "progressive";
      readonly formatId: string;
      /** A ready-to-fetch HTTPS URL; extraction resolves any signature deciphering before this is returned. */
      readonly url: string;
      readonly container: SourceContainer;
      readonly videoCodec: SourceVideoCodec;
      readonly audioCodec: SourceAudioCodec;
      readonly heightPixels: number;
      readonly bitrateBps: number;
      readonly approximateSizeBytes: number | undefined;
    }
  | {
      readonly role: "audio-only";
      readonly formatId: string;
      /** A ready-to-fetch HTTPS URL; extraction resolves any signature deciphering before this is returned. */
      readonly url: string;
      readonly container: SourceContainer;
      readonly audioCodec: SourceAudioCodec;
      readonly bitrateBps: number;
      readonly approximateSizeBytes: number | undefined;
    };

export type AudioOutputFormat = "aac" | "flac" | "mp3" | "opus" | "wav";
export type AudioQualityMode = "cbr" | "vbr";

export type TrimRange = {
  readonly startSeconds: number;
  readonly endSeconds: number;
};

/** Guards the only real invariant of a trim range: a positive, non-empty interval. */
export function createTrimRange(startSeconds: number, endSeconds: number): TrimRange {
  if (startSeconds < 0) throw new RangeError("The trim start cannot be negative.");
  if (endSeconds <= startSeconds) {
    throw new RangeError("The trim end must be greater than the start.");
  }
  return { startSeconds, endSeconds };
}

export type MediaSelection = {
  readonly kind: "audio";
  readonly format: AudioOutputFormat;
  readonly bitrateKbps: number | "max";
  readonly qualityMode: AudioQualityMode | undefined;
  readonly trim: TrimRange | undefined;
};
