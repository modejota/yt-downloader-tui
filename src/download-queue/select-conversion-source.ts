import type { FormatCandidate } from "@/domain/media";
import type { ConversionSource } from "@/domain/ports";
import { DomainError } from "@/errors/domain-error";

function highestBitrate(candidates: readonly FormatCandidate[]): FormatCandidate | undefined {
  return candidates.reduce<FormatCandidate | undefined>((best, candidate) => {
    if (best === undefined) return candidate;
    return candidate.bitrateBps > best.bitrateBps ? candidate : best;
  }, undefined);
}

/**
 * Picks which FormatCandidate feeds the media pipeline: the highest-bitrate
 * audio-only stream, falling back to the best progressive stream (whose
 * audio track the pipeline extracts).
 */
export function selectConversionSource(candidates: readonly FormatCandidate[]): ConversionSource {
  const audioOnly = candidates.filter((candidate) => candidate.role === "audio-only");
  const progressive = candidates.filter((candidate) => candidate.role === "progressive");
  const best = highestBitrate(audioOnly) ?? highestBitrate(progressive);
  if (best === undefined) {
    throw new DomainError("format-unavailable", "No audio stream is available for this video.");
  }
  return { role: "combined", format: best };
}
