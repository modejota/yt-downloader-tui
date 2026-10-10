import type { FormatCandidate } from "@/domain/media";

function highestBitrate(
  candidates: readonly FormatCandidate[],
  role: FormatCandidate["role"],
): FormatCandidate | undefined {
  return candidates
    .filter((candidate) => candidate.role === role)
    .toSorted((left, right) => right.bitrateBps - left.bitrateBps)[0];
}

/**
 * Picks which FormatCandidate feeds the media pipeline: the highest-bitrate
 * audio-only stream, falling back to the best progressive stream (whose
 * audio track the pipeline extracts). Undefined when the video has no audio stream at all.
 */
export function selectConversionSource(
  candidates: readonly FormatCandidate[],
): FormatCandidate | undefined {
  return highestBitrate(candidates, "audio-only") ?? highestBitrate(candidates, "progressive");
}
