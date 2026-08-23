import { describe, expect, it } from "bun:test";

import type { MediaSelection } from "@/domain/media";
import { audioFormatHasBitrateChoice, outputExtension } from "@/ui/format-options";

describe("outputExtension", () => {
  it("maps every audio format to its file extension", () => {
    const selection = (format: MediaSelection["format"]): MediaSelection => ({
      kind: "audio",
      format,
      bitrateKbps: "max",
      qualityMode: undefined,
      trim: undefined,
    });
    expect(outputExtension(selection("mp3"))).toBe("mp3");
    expect(outputExtension(selection("aac"))).toBe("m4a");
    expect(outputExtension(selection("opus"))).toBe("opus");
    expect(outputExtension(selection("flac"))).toBe("flac");
    expect(outputExtension(selection("wav"))).toBe("wav");
  });
});

describe("audioFormatHasBitrateChoice", () => {
  it("offers a bitrate choice only for lossy formats", () => {
    expect(audioFormatHasBitrateChoice("mp3")).toBe(true);
    expect(audioFormatHasBitrateChoice("aac")).toBe(true);
    expect(audioFormatHasBitrateChoice("opus")).toBe(true);
    expect(audioFormatHasBitrateChoice("flac")).toBe(false);
    expect(audioFormatHasBitrateChoice("wav")).toBe(false);
  });
});
