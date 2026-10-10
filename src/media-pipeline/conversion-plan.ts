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
} from "@/domain/media";

/** Everything mediabunny needs to turn one source stream into the user's selected audio file. */
export type AudioConversionPlan = {
  readonly outputFormat: OutputFormat;
  readonly audio: ConversionAudioOptions;
  readonly trim: { readonly start: number; readonly end: number } | undefined;
  readonly mode: "remux" | "transcode";
};

const AUDIO_CODECS = {
  mp3: "mp3",
  aac: "aac",
  opus: "opus",
  flac: "flac",
  wav: "pcm-s16",
} satisfies Record<AudioOutputFormat, AudioCodec>;

const OUTPUT_FORMATS = {
  mp3: () => new Mp3OutputFormat(),
  aac: () => new Mp4OutputFormat(),
  opus: () => new OggOutputFormat(),
  flac: () => new FlacOutputFormat(),
  wav: () => new WavOutputFormat(),
} satisfies Record<AudioOutputFormat, () => OutputFormat>;

const BITRATE_MODES = {
  cbr: "constant",
  vbr: "variable",
} satisfies Record<AudioQualityMode, "constant" | "variable">;

/**
 * Remuxes (copies the audio track untouched) when the source already is the requested codec at the
 * requested bitrate and no trim is needed; otherwise transcodes at the selected quality.
 */
export function planAudioConversion(
  source: FormatCandidate,
  selection: MediaSelection,
): AudioConversionPlan {
  const codec = AUDIO_CODECS[selection.format];
  const outputFormat = OUTPUT_FORMATS[selection.format]();
  const trim =
    selection.trim === undefined
      ? undefined
      : { start: selection.trim.startSeconds, end: selection.trim.endSeconds };

  const canRemux =
    codec === source.audioCodec &&
    (selection.bitrateKbps === "max" ||
      selection.bitrateKbps === Math.round(source.bitrateBps / 1000)) &&
    trim === undefined;
  if (canRemux) return { outputFormat, audio: { codec }, trim, mode: "remux" };

  const quality =
    selection.bitrateKbps === "max"
      ? new Quality("very-high")
      : new Quality({
          bitrate: selection.bitrateKbps * 1000,
          bitrateMode:
            selection.qualityMode === undefined ? undefined : BITRATE_MODES[selection.qualityMode],
        });

  return { outputFormat, audio: { codec, quality, forceTranscode: true }, trim, mode: "transcode" };
}
