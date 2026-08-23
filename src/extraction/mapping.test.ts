import { describe, expect, it } from "bun:test";

import {
  isMixPlaylistId,
  mapBasicVideoInfo,
  mapFormat,
  mapPlaylistInfo,
  mapPlaylistItem,
  mapSearchResult,
  parseYoutubeSourceUrl,
} from "@/extraction/mapping";
import type { PlaylistId, VideoId } from "@/domain/media";

describe("parseYoutubeSourceUrl", () => {
  it("recognizes a watch URL as a video", () => {
    expect(parseYoutubeSourceUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "video",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("recognizes a youtu.be short link as a video", () => {
    expect(parseYoutubeSourceUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      kind: "video",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("recognizes a shorts URL as a video", () => {
    expect(parseYoutubeSourceUrl("https://www.youtube.com/shorts/abc123")).toEqual({
      kind: "video",
      videoId: "abc123",
    });
  });

  it("recognizes a playlist URL as a playlist", () => {
    expect(parseYoutubeSourceUrl("https://www.youtube.com/playlist?list=PLabc123")).toEqual({
      kind: "playlist",
      playlistId: "PLabc123",
    });
  });

  it("treats a watch URL carrying a list= param as a playlist", () => {
    expect(
      parseYoutubeSourceUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123"),
    ).toEqual({ kind: "playlist", playlistId: "PLabc123" });
  });

  it("returns undefined for a non-YouTube URL", () => {
    expect(parseYoutubeSourceUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBeUndefined();
  });

  it("returns undefined for free text (search query)", () => {
    expect(parseYoutubeSourceUrl("lofi hip hop mix")).toBeUndefined();
  });
});

describe("isMixPlaylistId", () => {
  it("flags RD-prefixed ids as Mix/Radio playlists", () => {
    expect(isMixPlaylistId("RDdQw4w9WgXcQ")).toBe(true);
  });

  it("does not flag a regular playlist id", () => {
    expect(isMixPlaylistId("PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI")).toBe(false);
  });
});

describe("mapBasicVideoInfo", () => {
  it("maps a full InnerTube basic_info payload", () => {
    // Trimmed shape observed from Innertube#getInfo("dQw4w9WgXcQ").basic_info.
    const raw = {
      title: "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
      duration: 213,
      view_count: 1806078845,
      like_count: 19344414,
      channel: { id: "UCuAXFkgsw1L7xaCfnd5JJOw", name: "Rick Astley", url: "" },
      thumbnail: [{ url: "https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/maxresdefault.webp" }],
    };

    const video = mapBasicVideoInfo(raw, "dQw4w9WgXcQ" as VideoId);

    expect(video).toEqual({
      id: "dQw4w9WgXcQ" as VideoId,
      title: "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
      channelName: "Rick Astley",
      durationSeconds: 213,
      viewCount: 1806078845,
      likeCount: 19344414,
      thumbnailUrl: "https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/maxresdefault.webp",
    });
  });

  it("falls back safely when optional fields are missing", () => {
    const raw = { channel: null };

    const video = mapBasicVideoInfo(raw, "abc" as VideoId);

    expect(video).toEqual({
      id: "abc" as VideoId,
      title: "",
      channelName: "",
      durationSeconds: 0,
      viewCount: 0,
      likeCount: undefined,
      thumbnailUrl: undefined,
    });
  });
});

describe("mapSearchResult", () => {
  it("maps a search result of type Video", () => {
    // Trimmed shape observed from Innertube#search(...).results[i].
    const raw = {
      type: "Video",
      video_id: "n61ULEU7CO0",
      title: { toString: () => "Best of lofi hip hop 2021" },
      author: { name: "Lofi Girl" },
      view_count: { toString: () => "56,620,171 views" },
      best_thumbnail: { url: "https://i.ytimg.com/vi/n61ULEU7CO0/hq720.jpg" },
      duration: { seconds: 22258 },
    };

    expect(mapSearchResult(raw)).toEqual({
      id: "n61ULEU7CO0" as VideoId,
      title: "Best of lofi hip hop 2021",
      channelName: "Lofi Girl",
      durationSeconds: 22258,
      viewCount: 56620171,
      likeCount: undefined,
      thumbnailUrl: "https://i.ytimg.com/vi/n61ULEU7CO0/hq720.jpg",
    });
  });

  it("ignores non-video search results (channels, shelves, ...)", () => {
    const raw = {
      type: "Channel",
      video_id: "irrelevant",
      title: { toString: () => "irrelevant" },
      author: { name: "irrelevant" },
      duration: { seconds: 0 },
    };

    expect(mapSearchResult(raw)).toBeUndefined();
  });
});

describe("mapPlaylistInfo", () => {
  it("parses the video count out of the formatted total_items text", () => {
    const playlist = mapPlaylistInfo(
      { title: "Uploads from Rick Astley", total_items: "436 videos" },
      "UUuAXFkgsw1L7xaCfnd5JJOw" as PlaylistId,
    );

    expect(playlist).toEqual({
      id: "UUuAXFkgsw1L7xaCfnd5JJOw" as PlaylistId,
      title: "Uploads from Rick Astley",
      videoCount: 436,
    });
  });
});

describe("mapPlaylistItem", () => {
  it("maps a LockupView playlist item (current default renderer)", () => {
    // Trimmed shape observed from Innertube#getPlaylist(...).items[i].
    const raw = {
      content_id: "JjI4o2w6D5A",
      content_type: "VIDEO",
      metadata: {
        title: { toString: () => "We had a fantastic time in Cologne" },
        metadata: {
          metadata_rows: [{ metadata_parts: [{ text: { toString: () => "Rick Astley" } }] }],
        },
      },
      content_image: {
        type: "ThumbnailView",
        overlays: [
          { type: "ThumbnailBottomOverlayView", badges: [{ text: "0:21" }] },
          { type: "ThumbnailHoverOverlayToggleActionsView" },
        ],
      },
    };

    expect(mapPlaylistItem(raw)).toEqual({
      id: "JjI4o2w6D5A" as VideoId,
      title: "We had a fantastic time in Cologne",
      channelName: "Rick Astley",
      durationSeconds: 21,
      viewCount: 0,
      likeCount: undefined,
      thumbnailUrl: undefined,
    });
  });

  it("maps a PlaylistVideo item (classic renderer)", () => {
    const raw = {
      id: "6Ov-5W2nb28",
      title: { toString: () => "Some Video" },
      author: { name: "Some Channel" },
      duration: { seconds: 125 },
    };

    expect(mapPlaylistItem(raw)).toEqual({
      id: "6Ov-5W2nb28" as VideoId,
      title: "Some Video",
      channelName: "Some Channel",
      durationSeconds: 125,
      viewCount: 0,
      likeCount: undefined,
      thumbnailUrl: undefined,
    });
  });

  it("ignores non-video LockupView items (e.g. nested playlists)", () => {
    const raw = {
      content_id: "PLsomething",
      content_type: "PLAYLIST",
      metadata: null,
      content_image: null,
    };

    expect(mapPlaylistItem(raw)).toBeUndefined();
  });
});

describe("mapFormat", () => {
  it("maps a progressive mp4/h264+aac format", () => {
    // Trimmed shape observed from streaming_data.formats[0] (itag 18-style).
    const raw = {
      itag: 18,
      mime_type: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
      has_audio: true,
      has_video: true,
      height: 360,
      bitrate: 615377,
      content_length: 12345678,
    };

    expect(mapFormat(raw, "https://example.com/stream")).toEqual({
      role: "progressive",
      formatId: "18",
      url: "https://example.com/stream",
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      heightPixels: 360,
      bitrateBps: 615377,
      approximateSizeBytes: 12345678,
    });
  });

  it("drops video-only formats: the app only produces audio", () => {
    // Trimmed shape observed from streaming_data.adaptive_formats (2160p vp9).
    const raw = {
      itag: 337,
      mime_type: 'video/webm; codecs="vp9"',
      has_audio: false,
      has_video: true,
      height: 2160,
      bitrate: 18076636,
      content_length: undefined,
    };

    expect(mapFormat(raw, "https://example.com/video-only")).toBeUndefined();
  });

  it("maps an adaptive audio-only mp4/aac format", () => {
    // Trimmed shape observed from streaming_data.adaptive_formats (itag 140-style).
    const raw = {
      itag: 140,
      mime_type: 'audio/mp4; codecs="mp4a.40.2"',
      has_audio: true,
      has_video: false,
      bitrate: 130677,
      content_length: 3456789,
    };

    expect(mapFormat(raw, "https://example.com/audio-only")).toEqual({
      role: "audio-only",
      formatId: "140",
      url: "https://example.com/audio-only",
      container: "mp4",
      audioCodec: "aac",
      bitrateBps: 130677,
      approximateSizeBytes: 3456789,
    });
  });

  it("discards a format with no deciphered URL", () => {
    const raw = {
      itag: 18,
      mime_type: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
      has_audio: true,
      has_video: true,
      height: 360,
      bitrate: 615377,
      content_length: undefined,
    };

    expect(mapFormat(raw, "")).toBeUndefined();
  });

  it("discards a format with an unrecognized container", () => {
    const raw = {
      itag: 1,
      mime_type: "video/3gpp; codecs=mp4v.20.3",
      has_audio: true,
      has_video: true,
      height: 144,
      bitrate: 1000,
      content_length: undefined,
    };

    expect(mapFormat(raw, "https://example.com/legacy")).toBeUndefined();
  });
});
