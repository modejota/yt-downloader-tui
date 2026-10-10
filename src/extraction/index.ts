import vm from "node:vm";

import { Innertube, Log, Platform, YTNodes } from "youtubei.js";

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
const UNSUPPORTED_SOURCE_MESSAGE =
  "YouTube live streams and 'Mix' playlists are not supported yet.";
const VIDEO_UNAVAILABLE_MESSAGE =
  "This video is not available (it may be private, deleted, or unavailable in your region).";

/** Rewrites youtubei.js exceptions into DomainErrors for the rest of the app. */
function toDomainError(cause: unknown, context: Readonly<Record<string, string>>): DomainError {
  if (cause instanceof DomainError) return cause;

  const message = cause instanceof Error ? cause.message : String(cause);

  // Bun's fetch reports connection failures as a TypeError carrying a `code`.
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
    return new DomainError("video-unavailable", VIDEO_UNAVAILABLE_MESSAGE, context);
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

/**
 * youtubei.js pages continue from the live response object, so the opaque page tokens handed to
 * the UI map back to the stored response. Each token is single-use.
 */
function createContinuationStore<Page>(expiredMessage: string) {
  const pages = new Map<string, Page>();
  let sequence = 0;

  return {
    store(page: Page): string {
      const token = `${sequence}`;
      sequence += 1;
      pages.set(token, page);
      return token;
    },
    take(token: string): Page {
      const page = pages.get(token);
      pages.delete(token);
      if (page === undefined)
        throw new DomainError("unknown", expiredMessage, { pageToken: token });
      return page;
    },
  };
}

type PlaylistResponse = Awaited<ReturnType<Innertube["getPlaylist"]>>;
type SearchResponse = Awaited<ReturnType<Innertube["search"]>>;

export function createYoutubeExtractionService(): ExtractionService {
  installJavascriptEvaluator();
  // youtubei.js reports parser drift (YouTube shipping new node types) as multi-page warnings with
  // stack traces; they are for its maintainers, and real failures still reach us as exceptions.
  Log.setLevel(Log.Level.NONE);

  // The session is created lazily (warmed up right away) so the app starts offline and a failed
  // session surfaces as a request error, then gets recreated by the next request.
  let pendingClient: Promise<Innertube> | undefined;
  function getClient(): Promise<Innertube> {
    pendingClient ??= Innertube.create().catch((cause: unknown) => {
      pendingClient = undefined;
      throw cause;
    });
    return pendingClient;
  }
  getClient().catch(() => undefined);

  const playlistContinuations = createContinuationStore<PlaylistResponse>(
    "This playlist page is no longer available; reopen it.",
  );
  const searchContinuations = createContinuationStore<{ page: SearchResponse; consumed: number }>(
    "This results page is no longer available; repeat the search.",
  );

  async function resolvePlaylist(playlistId: PlaylistId): Promise<ResolvedSource> {
    if (isMixPlaylistId(playlistId)) {
      throw new DomainError("unsupported-source", UNSUPPORTED_SOURCE_MESSAGE, { playlistId });
    }
    try {
      const raw = await (await getClient()).getPlaylist(playlistId);
      return { kind: "playlist", playlist: mapPlaylistInfo(raw.info, playlistId) };
    } catch (cause) {
      throw toDomainError(cause, { playlistId });
    }
  }

  async function resolveVideo(videoId: VideoId): Promise<ResolvedSource> {
    try {
      const raw = await (await getClient()).getInfo(videoId);
      if (raw.basic_info.is_live === true) {
        throw new DomainError("unsupported-source", UNSUPPORTED_SOURCE_MESSAGE, { videoId });
      }
      const status = raw.playability_status?.status;
      if (status !== "OK") {
        throw new DomainError("video-unavailable", VIDEO_UNAVAILABLE_MESSAGE, {
          videoId,
          status: status ?? "unknown",
        });
      }
      return { kind: "video", video: mapBasicVideoInfo(raw.basic_info, videoId) };
    } catch (cause) {
      throw toDomainError(cause, { videoId });
    }
  }

  async function resolveSource(input: string, signal: AbortSignal): Promise<ResolvedSource> {
    signal.throwIfAborted();

    const source = parseYoutubeSourceUrl(input);
    if (source === undefined) {
      throw new DomainError("video-unavailable", "That is not a valid YouTube URL.", { input });
    }
    return source.kind === "playlist"
      ? resolvePlaylist(source.playlistId)
      : resolveVideo(source.videoId);
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
          ? { page: await (await getClient()).search(query, { type: "video" }), consumed: 0 }
          : searchContinuations.take(pageToken);

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
          ? searchContinuations.store({
              page: state.page,
              consumed: consumedBefore + servedFromFeed,
            })
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
          ? await (await getClient()).getPlaylist(playlistId)
          : await playlistContinuations.take(pageToken).getContinuation();

      const items = page.items.flatMap((raw) => {
        if (!raw.is(YTNodes.LockupView, YTNodes.PlaylistVideo)) return [];
        return mapPlaylistItem(raw) ?? [];
      });

      return {
        playlist: mapPlaylistInfo(page.info, playlistId),
        items,
        nextPageToken: page.has_continuation ? playlistContinuations.store(page) : undefined,
      };
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
      const client = await getClient();
      // ANDROID is the one client whose stream URLs are reliably fetchable
      const raw = await client.getBasicInfo(videoId, { client: "ANDROID" });
      const allFormats = [
        ...(raw.streaming_data?.formats ?? []),
        ...(raw.streaming_data?.adaptive_formats ?? []),
      ];

      // Some listed formats carry no decipherable URL; skip them individually.
      const candidates = await Promise.all(
        allFormats.map(async (format) => {
          try {
            return mapFormat(format, await format.decipher(client.session.player)) ?? [];
          } catch {
            return [];
          }
        }),
      );
      return candidates.flat();
    } catch (cause) {
      throw toDomainError(cause, { videoId });
    }
  }

  return { resolveSource, search, listPlaylistItems, getFormatCandidates };
}
