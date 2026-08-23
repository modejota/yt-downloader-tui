import type { AttachedImage, MetadataTags, Output } from "mediabunny";

import { DomainError } from "@/errors/domain-error";
import type { ConversionSpec, EmbeddedMetadata } from "@/domain/ports";

/**
 * Sets the output's descriptive metadata tags (title/artist/cover art),
 * fetching the cover art image from its remote URL. mediabunny requires
 * `Output.setMetadataTags` to be called before the output starts, so callers
 * must run this before `output.start()` - earlier than "tagging"
 * conceptually sits in the download → convert → tag → done narrative, but
 * it's the only order mediabunny allows.
 */
export async function prepareTagging(
  output: Output,
  spec: ConversionSpec,
  signal: AbortSignal,
): Promise<void> {
  if (spec.metadata === undefined) return;
  output.setMetadataTags(await buildMetadataTags(spec.metadata, signal));
}

async function buildMetadataTags(
  metadata: EmbeddedMetadata,
  signal: AbortSignal,
): Promise<MetadataTags> {
  if (metadata.thumbnailUrl === undefined) {
    return { title: metadata.title, artist: metadata.artist };
  }
  const image = await fetchCoverArt(metadata.thumbnailUrl, signal);
  return { title: metadata.title, artist: metadata.artist, images: [image] };
}

async function fetchCoverArt(url: string, signal: AbortSignal): Promise<AttachedImage> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new DomainError("conversion", "Could not fetch the cover art to embed it.", { url });
  }
  if (!response.ok) {
    throw new DomainError(
      "conversion",
      `Fetching the cover art responded with status ${response.status}.`,
      {
        url,
        status: String(response.status),
      },
    );
  }
  const data = new Uint8Array(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type") ?? "image/jpeg";
  return { data, mimeType, kind: "coverFront" };
}
