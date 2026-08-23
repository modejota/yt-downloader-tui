import vm from "node:vm";

import { Innertube, Platform, YTNodes } from "youtubei.js";

import type { ExtractionService, PlaylistPage, ResolvedSource, SearchPage } from "@/domain/ports";
import type { FormatCandidate, PlaylistId, Video, VideoId } from "@/domain/media";
import { DomainError } from "@/errors/domain-error";
import {
  isMixPlaylistId,
  mapBasicVideoInfo,
  mapFormat,
  mapPlaylistInfo,
  mapPlaylistItem,
  mapSearchResult,
  parseYoutubeSourceUrl,
} from "@/extraction/mapping";

const MAX_SEARCH_CONTINUATION_PAGES = 10;

/** Rewrites youtubei.js exceptions into DomainErrors for the rest of the app. */
function toDomainError(cause: unknown, context: Readonly<Record<string, string>>): DomainError {
  if (cause instanceof DomainError) return cause;

  const message = cause instanceof Error ? cause.message : String(cause);

  if (cause instanceof TypeError || /status code 5\d\d/u.test(message)) {
    return new DomainError(
      "network",
      "Could not connect to YouTube. Check your connection and try again.",
      context,
    );
  }

  if (
    /unavailable|private|removed|deleted|unviewable|age.?restrict|status code 4\d\d/iu.test(message)
  ) {
    return new DomainError(
      "video-unavailable",
      "This video is not available (it may be private, deleted, or unavailable in your region).",
      context,
    );
  }

  return new DomainError(
    "unknown",
    "Something went wrong while processing this video. You can retry or try again later.",
    context,
  );
}

function installJavascriptEvaluator(): void {
  // data.output is generated from YouTube's own player script (untrusted, and reachable via a
  // network MITM). Run it in a bare vm context instead of `new Function` so it has no access to
  // `process`, `require`, the filesystem, or this module's scope.
  Platform.shim.eval = async (data) => {
    const sandbox = vm.createContext(Object.create(null));
    const run = vm.compileFunction(data.output, [], { parsingContext: sandbox });
    return run();
  };
}

export async function createYoutubeExtractionService(): Promise<ExtractionService> {
  installJavascriptEvaluator();
  const client = await Innertube.create();

  const playlistContinuations = new Map<string, Awaited<ReturnType<typeof client.getPlaylist>>>();
  const searchContinuations = new Map<
    string,
    { page: Awaited<ReturnType<typeof client.search>>; consumed: number }
  >();
  let continuationSequence = 0;

  function storePlaylistContinuation(page: Awaited<ReturnType<typeof client.getPlaylist>>): string {
    const token = `${continuationSequence}`;
    continuationSequence += 1;
    playlistContinuations.set(token, page);
    return token;
  }

  function takePlaylistContinuation(
    token: string,
  ): Promise<Awaited<ReturnType<typeof client.getPlaylist>>> {
    const page = playlistContinuations.get(token);
    playlistContinuations.delete(token);
    if (page === undefined) {
      throw new DomainError("unknown", "This playlist page is no longer available; reopen it.", {
        pageToken: token,
      });
    }
    return page.getContinuation();
  }

  function storeSearchContinuation(
    page: Awaited<ReturnType<typeof client.search>>,
    consumed: number,
  ): string {
    const token = `${continuationSequence}`;
    continuationSequence += 1;
    searchContinuations.set(token, { page, consumed });
    return token;
  }

  function takeSearchContinuation(token: string): {
    page: Awaited<ReturnType<typeof client.search>>;
    consumed: number;
  } {
    const entry = searchContinuations.get(token);
    searchContinuations.delete(token);
    if (entry === undefined) {
      throw new DomainError(
        "unknown",
        "This results page is no longer available; repeat the search.",
        {
          pageToken: token,
        },
      );
    }
    return entry;
  }

  async function resolveSource(input: string, signal: AbortSignal): Promise<ResolvedSource> {
    signal.throwIfAborted();

    const parsed = parseYoutubeSourceUrl(input);
    if (parsed === undefined) {
      throw new DomainError("video-unavailable", "That is not a valid YouTube URL.", { input });
    }

    if (parsed.kind === "playlist") {
      if (isMixPlaylistId(parsed.playlistId)) {
        throw new DomainError(
          "unsupported-source",
          "YouTube live streams and 'Mix' playlists are not supported yet.",
          { playlistId: parsed.playlistId },
        );
      }
      try {
        const raw = await client.getPlaylist(parsed.playlistId);
        const playlist = mapPlaylistInfo(raw.info, parsed.playlistId as PlaylistId);
        return { kind: "playlist", playlist };
      } catch (cause) {
        throw toDomainError(cause, { playlistId: parsed.playlistId });
      }
    }

    try {
      const raw = await client.getInfo(parsed.videoId);
      if (raw.basic_info.is_live === true) {
        throw new DomainError(
          "unsupported-source",
          "YouTube live streams and 'Mix' playlists are not supported yet.",
          { videoId: parsed.videoId },
        );
      }
      if (raw.playability_status?.status !== "OK") {
        throw new DomainError(
          "video-unavailable",
          "This video is not available (it may be private, deleted, or unavailable in your region).",
          { videoId: parsed.videoId, status: raw.playability_status?.status ?? "unknown" },
        );
      }
      const video = mapBasicVideoInfo(raw.basic_info, parsed.videoId as VideoId);
      return { kind: "video", video };
    } catch (cause) {
      throw toDomainError(cause, { videoId: parsed.videoId });
    }
  }

  async function search(
    query: string,
    resultCount: number,
    pageToken: string | undefined,
    signal: AbortSignal,
  ): Promise<SearchPage> {
    signal.throwIfAborted();

    try {
      let state =
        pageToken === undefined
          ? { page: await client.search(query, { type: "video" }), consumed: 0 }
          : takeSearchContinuation(pageToken);

      const results: Video[] = [];
      let consumedBefore = state.consumed;
      let servedFromFeed = 0;
      let stoppedMidFeed = false;

      for (let pageIndex = 0; pageIndex < MAX_SEARCH_CONTINUATION_PAGES; pageIndex += 1) {
        for (const raw of state.page.results) {
          if (!raw.is(YTNodes.Video)) continue;
          if (consumedBefore > 0) {
            consumedBefore -= 1;
            continue;
          }
          if (results.length >= resultCount) {
            stoppedMidFeed = true;
            break;
          }
          servedFromFeed += 1;
          const video = mapSearchResult(raw);
          if (video !== undefined) results.push(video);
        }
        if (stoppedMidFeed || !state.page.has_continuation) break;
        state = { page: await state.page.getContinuation(), consumed: 0 };
        consumedBefore = 0;
        servedFromFeed = 0;
      }

      const nextPageToken =
        stoppedMidFeed && state.page.has_continuation
          ? storeSearchContinuation(state.page, consumedBefore + servedFromFeed)
          : undefined;
      return { results, nextPageToken };
    } catch (cause) {
      throw toDomainError(cause, { query });
    }
  }

  async function listPlaylistItems(
    playlistId: PlaylistId,
    pageToken: string | undefined,
    signal: AbortSignal,
  ): Promise<PlaylistPage> {
    signal.throwIfAborted();

    try {
      const page =
        pageToken === undefined
          ? await client.getPlaylist(playlistId)
          : await takePlaylistContinuation(pageToken);

      const items: Video[] = [];
      for (const raw of page.items) {
        if (!raw.is(YTNodes.LockupView, YTNodes.PlaylistVideo)) continue;
        const video = mapPlaylistItem(raw);
        if (video !== undefined) items.push(video);
      }

      const playlist = mapPlaylistInfo(page.info, playlistId);
      const nextPageToken = page.has_continuation ? storePlaylistContinuation(page) : undefined;

      return { playlist, items, nextPageToken };
    } catch (cause) {
      throw toDomainError(cause, { playlistId });
    }
  }

  async function getFormatCandidates(
    videoId: VideoId,
    signal: AbortSignal,
  ): Promise<readonly FormatCandidate[]> {
    signal.throwIfAborted();

    try {
      // ANDROID is the one client whose stream URLs are reliably fetchable
      const raw = await client.getBasicInfo(videoId, { client: "ANDROID" });
      const allFormats = [
        ...(raw.streaming_data?.formats ?? []),
        ...(raw.streaming_data?.adaptive_formats ?? []),
      ];

      // Some listed formats carry no decipherable URL; skip them individually.
      const deciphered = await Promise.all(
        allFormats.map(async (format) => {
          try {
            const url = await format.decipher(client.session.player);
            return mapFormat(format, url);
          } catch {
            return undefined;
          }
        }),
      );
      const candidates = deciphered.filter(
        (candidate): candidate is FormatCandidate => candidate !== undefined,
      );
      return candidates;
    } catch (cause) {
      throw toDomainError(cause, { videoId });
    }
  }

  return { resolveSource, search, listPlaylistItems, getFormatCandidates };
}
