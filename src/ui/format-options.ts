import type { AudioOutputFormat, AudioQualityMode, MediaSelection } from "@/domain/media";

/** The choices offered wherever an audio output is picked (format selection and settings). */
export const AUDIO_FORMATS: readonly AudioOutputFormat[] = ["mp3", "aac", "opus", "flac", "wav"];
export const AUDIO_QUALITY_MODES: readonly AudioQualityMode[] = ["cbr", "vbr"];
export const AUDIO_BITRATES: readonly (number | "max")[] = ["max", 320, 256, 192, 128, 96];

const AUDIO_EXTENSIONS = {
  mp3: "mp3",
  aac: "m4a",
  opus: "opus",
  flac: "flac",
  wav: "wav",
} as const;

export function outputExtension(selection: MediaSelection): string {
  return AUDIO_EXTENSIONS[selection.format];
}

export function audioFormatHasBitrateChoice(format: AudioOutputFormat): boolean {
  return format === "aac" || format === "mp3" || format === "opus";
}
