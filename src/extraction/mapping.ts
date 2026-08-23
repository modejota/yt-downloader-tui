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
  | { readonly kind: "video"; readonly videoId: string }
  | { readonly kind: "playlist"; readonly playlistId: string };

const YOUTUBE_HOSTS = new Set(["youtube.com", "youtu.be", "music.youtube.com"]);

export function parseYoutubeSourceUrl(input: string): ParsedSource | undefined {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }

  const host = url.hostname.replace(/^(www|m)\./u, "");
  if (!YOUTUBE_HOSTS.has(host)) return undefined;

  const listId = url.searchParams.get("list");
  if (listId !== null && listId.length > 0) return { kind: "playlist", playlistId: listId };

  if (host === "youtu.be") {
    const videoId = url.pathname.slice(1);
    return videoId.length > 0 ? { kind: "video", videoId } : undefined;
  }

  const shortsMatch = /^\/shorts\/([^/]+)/u.exec(url.pathname);
  if (shortsMatch?.[1] !== undefined) return { kind: "video", videoId: shortsMatch[1] };

  const videoId = url.searchParams.get("v");
  return videoId !== null && videoId.length > 0 ? { kind: "video", videoId } : undefined;
}

/** YouTube prefixes auto-generated Mix/Radio playlist ids with "RD". */
export function isMixPlaylistId(playlistId: string): boolean {
  return playlistId.startsWith("RD");
}

function extractLeadingNumber(text: string): number {
  const digitsOnly = text.replace(/\D+/gu, "");
  return digitsOnly.length === 0 ? 0 : Number.parseInt(digitsOnly, 10);
}

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
    id: raw.video_id as VideoId,
    title: raw.title.toString(),
    channelName: raw.author.name,
    durationSeconds: raw.duration.seconds,
    viewCount: raw.view_count === undefined ? 0 : extractLeadingNumber(raw.view_count.toString()),
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
    videoCount: extractLeadingNumber(raw.total_items),
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

function findDurationLabel(
  contentImage: RawLockupPlaylistItem["content_image"],
): string | undefined {
  for (const overlay of contentImage?.overlays ?? []) {
    const badge = overlay.badges?.[0];
    if (badge !== undefined) return badge.text;
  }
  return undefined;
}

export function mapPlaylistItem(raw: RawPlaylistItem): Video | undefined {
  if (!("content_id" in raw)) {
    return {
      id: raw.id as VideoId,
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
    id: raw.content_id as VideoId,
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

export function mapFormat(raw: RawFormat, url: string): FormatCandidate | undefined {
  if (url.length === 0) return undefined;

  const container = containerFromMimeType(raw.mime_type);
  if (container === undefined) return undefined;

  const formatId = String(raw.itag);
  const approximateSizeBytes = raw.content_length;

  if (raw.has_audio && raw.has_video) {
    const videoCodec = videoCodecFromMimeType(raw.mime_type);
    const audioCodec = audioCodecFromMimeType(raw.mime_type);
    if (videoCodec === undefined || audioCodec === undefined || raw.height === undefined) {
      return undefined;
    }
    return {
      role: "progressive",
      formatId,
      url,
      container,
      videoCodec,
      audioCodec,
      heightPixels: raw.height,
      bitrateBps: raw.bitrate,
      approximateSizeBytes,
    };
  }

  if (raw.has_audio) {
    const audioCodec = audioCodecFromMimeType(raw.mime_type);
    if (audioCodec === undefined) return undefined;
    return {
      role: "audio-only",
      formatId,
      url,
      container,
      audioCodec,
      bitrateBps: raw.bitrate,
      approximateSizeBytes,
    };
  }

  return undefined;
}
