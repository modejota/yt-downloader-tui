import { describe, expect, it } from "bun:test";

import type { FormatCandidate } from "@/domain/media";
import { selectConversionSource } from "@/download-queue/select-conversion-source";

function progressive(heightPixels: number, bitrateBps = 1000): FormatCandidate {
  return {
    role: "progressive",
    formatId: `p-${heightPixels}`,
    url: `https://example.test/${heightPixels}`,
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    heightPixels,
    bitrateBps,
    approximateSizeBytes: undefined,
  };
}

function audioOnly(bitrateBps: number): FormatCandidate {
  return {
    role: "audio-only",
    formatId: `a-${bitrateBps}`,
    url: `https://example.test/a${bitrateBps}`,
    container: "webm",
    audioCodec: "opus",
    bitrateBps,
    approximateSizeBytes: undefined,
  };
}

describe("selectConversionSource", () => {
  it("picks the highest-bitrate audio stream", () => {
    const candidates = [audioOnly(64_000), audioOnly(160_000), progressive(720, 900)];
    const result = selectConversionSource(candidates);
    expect(result).toEqual({ role: "combined", format: audioOnly(160_000) });
  });

  it("falls back to the best progressive stream when no audio-only stream exists", () => {
    const candidates = [progressive(360, 900), progressive(720, 1400)];
    const result = selectConversionSource(candidates);
    expect(result).toEqual({ role: "combined", format: progressive(720, 1400) });
  });

  it("throws format-unavailable when nothing usable exists", () => {
    expect(() => selectConversionSource([])).toThrow(/No audio stream/u);
  });
});
