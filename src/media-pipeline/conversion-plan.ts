import {
  FlacOutputFormat,
  Mp3OutputFormat,
  Mp4OutputFormat,
  OggOutputFormat,
  Quality,
  WavOutputFormat,
} from "mediabunny";
import type { AudioCodec, ConversionAudioOptions, OutputFormat } from "mediabunny";

import type {
  AudioOutputFormat,
  AudioQualityMode,
  FormatCandidate,
  MediaSelection,
  SourceAudioCodec,
  TrimRange,
} from "@/domain/media";

export type AudioConversionPlan = {
  readonly options: ConversionAudioOptions;
  readonly isRemux: boolean;
};

type AudioTrackInfo = {
  readonly audioCodec: SourceAudioCodec;
  readonly bitrateBps: number;
};

export type TrimOption = { readonly start: number; readonly end: number };

const AUDIO_CODEC_TABLE = {
  mp3: "mp3",
  aac: "aac",
  opus: "opus",
  flac: "flac",
  wav: "pcm-s16",
} satisfies Record<AudioOutputFormat, AudioCodec>;

const AUDIO_OUTPUT_FORMATS = {
  mp3: () => new Mp3OutputFormat(),
  aac: () => new Mp4OutputFormat(),
  opus: () => new OggOutputFormat(),
  flac: () => new FlacOutputFormat(),
  wav: () => new WavOutputFormat(),
} satisfies Record<AudioOutputFormat, () => OutputFormat>;

/** Picks the mediabunny output container implied by the user's selection. */
export function pickOutputFormat(selection: MediaSelection): OutputFormat {
  return AUDIO_OUTPUT_FORMATS[selection.format]();
}

/** Both candidate shapes carry an audio track; this is the type-level proof. */
export function requireAudioTrack(candidate: FormatCandidate): AudioTrackInfo {
  return { audioCodec: candidate.audioCodec, bitrateBps: candidate.bitrateBps };
}

/** Converts a user-facing TrimRange into mediabunny's `{ start, end }` trim option shape. */
export function toTrimOption(trim: TrimRange | undefined): TrimOption | undefined {
  if (trim === undefined) return undefined;
  return { start: trim.startSeconds, end: trim.endSeconds };
}

function matchesTargetBitrate(bitrateKbps: number | "max", sourceBitrateBps: number): boolean {
  return bitrateKbps === "max" || bitrateKbps === Math.round(sourceBitrateBps / 1000);
}

function audioCodecMatchesSource(
  format: AudioOutputFormat,
  sourceCodec: SourceAudioCodec,
): boolean {
  return (
    (format === "aac" && sourceCodec === "aac") || (format === "opus" && sourceCodec === "opus")
  );
}

function qualityBitrateMode(
  mode: AudioQualityMode | undefined,
): "constant" | "variable" | undefined {
  if (mode === undefined) return undefined;
  return mode === "cbr" ? "constant" : "variable";
}

export function resolveAudioConversionPlan(
  sourceCodec: SourceAudioCodec,
  sourceBitrateBps: number,
  selection: MediaSelection,
): AudioConversionPlan {
  const codec = AUDIO_CODEC_TABLE[selection.format];
  const isRemux =
    audioCodecMatchesSource(selection.format, sourceCodec) &&
    matchesTargetBitrate(selection.bitrateKbps, sourceBitrateBps) &&
    selection.trim === undefined;

  if (isRemux) {
    return { options: { codec }, isRemux: true };
  }

  const quality =
    selection.bitrateKbps === "max"
      ? new Quality("very-high")
      : new Quality({
          bitrate: selection.bitrateKbps * 1000,
          bitrateMode: qualityBitrateMode(selection.qualityMode),
        });

  return { options: { codec, quality, forceTranscode: true }, isRemux: false };
}
