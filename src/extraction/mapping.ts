import { createPlaylistId, createVideoId } from "@/domain/media";
import type {
  FormatCandidate,
  Playlist,
  PlaylistId,
  SourceAudioCodec,
  SourceContainer,
  SourceVideoCodec,
  Video,
  VideoId,
} from "@/domain/media";

export type ParsedSource =
  | { readonly kind: "video"; readonly videoId: VideoId }
  | { readonly kind: "playlist"; readonly playlistId: PlaylistId };

const YOUTUBE_HOSTS = new Set(["youtube.com", "youtu.be", "music.youtube.com"]);

/** Recognizes a YouTube video or playlist URL; `undefined` for anything else (e.g. a search query). */
export function parseYoutubeSourceUrl(input: string): ParsedSource | undefined {
  if (!URL.canParse(input)) return undefined;
  const url = new URL(input);

  const host = url.hostname.replace(/^(www|m)\./u, "");
  if (!YOUTUBE_HOSTS.has(host)) return undefined;

  const listId = url.searchParams.get("list");
  if (listId) return { kind: "playlist", playlistId: createPlaylistId(listId) };

  const videoId =
    host === "youtu.be"
      ? url.pathname.slice(1)
      : (/^\/shorts\/([^/]+)/u.exec(url.pathname)?.[1] ?? url.searchParams.get("v"));
  if (!videoId) return undefined;
  return { kind: "video", videoId: createVideoId(videoId) };
}

/** YouTube prefixes auto-generated Mix/Radio playlist ids with "RD". */
export function isMixPlaylistId(playlistId: PlaylistId): boolean {
  return playlistId.startsWith("RD");
}

/** Reads a formatted count such as "56,620,171 views" or "436 videos". */
function parseCountLabel(text: string): number {
  const digitsOnly = text.replace(/\D+/gu, "");
  return digitsOnly.length === 0 ? 0 : Number.parseInt(digitsOnly, 10);
}

/** Reads a clock label such as "1:02:03" into seconds. */
function parseDurationLabel(text: string): number {
  return text
    .split(":")
    .map((part) => Number.parseInt(part, 10))
    .reduce((total, part) => total * 60 + (Number.isNaN(part) ? 0 : part), 0);
}

export type RawBasicVideoInfo = {
  readonly title?: string;
  readonly duration?: number;
  readonly view_count?: number;
  readonly like_count?: number;
  readonly channel: { readonly name: string } | null;
  readonly thumbnail?: readonly { readonly url: string }[];
};

export function mapBasicVideoInfo(raw: RawBasicVideoInfo, id: VideoId): Video {
  return {
    id,
    title: raw.title ?? "",
    channelName: raw.channel?.name ?? "",
    durationSeconds: raw.duration ?? 0,
    viewCount: raw.view_count ?? 0,
    likeCount: raw.like_count,
    thumbnailUrl: raw.thumbnail?.[0]?.url,
  };
}

export type RawSearchVideo = {
  readonly type: string;
  readonly video_id: string;
  readonly title: { toString(): string };
  readonly author: { readonly name: string };
  readonly view_count?: { toString(): string } | undefined;
  readonly best_thumbnail?: { readonly url: string } | undefined;
  readonly duration: { readonly seconds: number };
};

/** `undefined` for any search result that isn't a plain video (channel, shelf, ad, ...). */
export function mapSearchResult(raw: RawSearchVideo): Video | undefined {
  if (raw.type !== "Video") return undefined;

  return {
    id: createVideoId(raw.video_id),
    title: raw.title.toString(),
    channelName: raw.author.name,
    durationSeconds: raw.duration.seconds,
    viewCount: raw.view_count === undefined ? 0 : parseCountLabel(raw.view_count.toString()),
    likeCount: undefined,
    thumbnailUrl: raw.best_thumbnail?.url,
  };
}

export type RawPlaylistInfo = {
  readonly title?: string;
  readonly total_items: string;
};

export function mapPlaylistInfo(raw: RawPlaylistInfo, id: PlaylistId): Playlist {
  return {
    id,
    title: raw.title ?? "",
    videoCount: parseCountLabel(raw.total_items),
  };
}

type RawPlaylistVideoItem = {
  readonly id: string;
  readonly title: { toString(): string };
  readonly author: { readonly name: string };
  readonly duration: { readonly seconds: number };
};

/** The current default renderer for playlist/uploads feeds as of youtubei.js 18. */
type RawLockupPlaylistItem = {
  readonly content_id: string;
  readonly content_type: string;
  readonly metadata: {
    readonly title: { toString(): string };
    readonly metadata: {
      readonly metadata_rows: readonly {
        readonly metadata_parts?: readonly { readonly text: { toString(): string } | null }[];
      }[];
    } | null;
  } | null;
  readonly content_image: {
    readonly type: string;
    readonly overlays?: readonly {
      readonly type: string;
      readonly badges?: readonly { readonly text: string }[];
    }[];
  } | null;
};

export type RawPlaylistItem = RawPlaylistVideoItem | RawLockupPlaylistItem;

/** The duration badge YouTube overlays on a lockup thumbnail, e.g. "3:45". */
function findDurationLabel(
  contentImage: RawLockupPlaylistItem["content_image"],
): string | undefined {
  return contentImage?.overlays?.flatMap((overlay) => overlay.badges ?? [])[0]?.text;
}

export function mapPlaylistItem(raw: RawPlaylistItem): Video | undefined {
  if (!("content_id" in raw)) {
    return {
      id: createVideoId(raw.id),
      title: raw.title.toString(),
      channelName: raw.author.name,
      durationSeconds: raw.duration.seconds,
      viewCount: 0,
      likeCount: undefined,
      thumbnailUrl: undefined,
    };
  }

  if (raw.content_type !== "VIDEO" || raw.metadata === null) return undefined;

  const channelName =
    raw.metadata.metadata?.metadata_rows[0]?.metadata_parts?.[0]?.text?.toString() ?? "";
  const durationLabel = findDurationLabel(raw.content_image);

  return {
    id: createVideoId(raw.content_id),
    title: raw.metadata.title.toString(),
    channelName,
    durationSeconds: durationLabel === undefined ? 0 : parseDurationLabel(durationLabel),
    viewCount: 0,
    likeCount: undefined,
    thumbnailUrl: undefined,
  };
}

export type RawFormat = {
  readonly itag: number;
  readonly mime_type: string;
  readonly has_audio: boolean;
  readonly has_video: boolean;
  readonly height?: number;
  readonly bitrate: number;
  readonly content_length?: number;
};

function containerFromMimeType(mimeType: string): SourceContainer | undefined {
  if (mimeType.startsWith("video/mp4") || mimeType.startsWith("audio/mp4")) return "mp4";
  if (mimeType.startsWith("video/webm") || mimeType.startsWith("audio/webm")) return "webm";
  return undefined;
}

function videoCodecFromMimeType(mimeType: string): SourceVideoCodec | undefined {
  if (mimeType.includes("avc1")) return "h264";
  if (mimeType.includes("av01")) return "av1";
  if (mimeType.includes("vp9") || mimeType.includes("vp09")) return "vp9";
  if (mimeType.includes("hev1") || mimeType.includes("hvc1")) return "h265";
  return undefined;
}

function audioCodecFromMimeType(mimeType: string): SourceAudioCodec | undefined {
  if (mimeType.includes("mp4a")) return "aac";
  if (mimeType.includes("opus")) return "opus";
  return undefined;
}

/** `undefined` for formats the app cannot use: no URL, unknown container/codec, or no audio. */
export function mapFormat(raw: RawFormat, url: string): FormatCandidate | undefined {
  const container = containerFromMimeType(raw.mime_type);
  const audioCodec = audioCodecFromMimeType(raw.mime_type);
  if (url.length === 0 || container === undefined || !raw.has_audio || audioCodec === undefined) {
    return undefined;
  }

  const common = {
    formatId: String(raw.itag),
    url,
    container,
    audioCodec,
    bitrateBps: raw.bitrate,
    approximateSizeBytes: raw.content_length,
  };
  if (!raw.has_video) return { role: "audio-only", ...common };

  const videoCodec = videoCodecFromMimeType(raw.mime_type);
  if (videoCodec === undefined || raw.height === undefined) return undefined;
  return { role: "progressive", ...common, videoCodec, heightPixels: raw.height };
}
