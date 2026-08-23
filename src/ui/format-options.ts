import type { MediaSelection } from "@/domain/media";

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

export function audioFormatHasBitrateChoice(
  format: "aac" | "flac" | "mp3" | "opus" | "wav",
): boolean {
  return format === "aac" || format === "mp3" || format === "opus";
}
