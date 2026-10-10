import type { AttachedImage, MetadataTags } from "mediabunny";

import { DomainError } from "@/errors/domain-error";
import type { EmbeddedMetadata } from "@/domain/ports";

/** Builds the output's title/artist tags, downloading the cover art from its remote URL when there is one. */
export async function fetchMetadataTags(
  metadata: EmbeddedMetadata,
  signal: AbortSignal,
): Promise<MetadataTags> {
  const tags = { title: metadata.title, artist: metadata.artist };
  if (metadata.thumbnailUrl === undefined) return tags;
  return { ...tags, images: [await fetchCoverArt(metadata.thumbnailUrl, signal)] };
}

async function fetchCoverArt(url: string, signal: AbortSignal): Promise<AttachedImage> {
  const response = await fetch(url, { signal }).catch((cause: unknown) => {
    if (signal.aborted) throw cause;
    throw new DomainError("conversion", "Could not fetch the cover art to embed it.", { url });
  });
  if (!response.ok) {
    throw new DomainError(
      "conversion",
      `Fetching the cover art responded with status ${response.status}.`,
      { url, status: String(response.status) },
    );
  }
  const data = new Uint8Array(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type") ?? "image/jpeg";
  return { data, mimeType, kind: "coverFront" };
}
