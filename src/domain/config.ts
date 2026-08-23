import type { AudioOutputFormat, AudioQualityMode } from "@/domain/media";

export type QueuePanelPosition = "bottom" | "left" | "right" | "top";

/**
 * `"system"` resolves to the OS locale at startup
 */
export type Language = "en" | "es" | "system";

/** Persisted user preferences that pre-fill every selector. */
export type Defaults = {
  readonly language: Language;
  readonly defaultAudioFormat: AudioOutputFormat;
  readonly defaultAudioBitrateKbps: number | "max";
  readonly defaultAudioQualityMode: AudioQualityMode;
  readonly downloadFolder: string;
  readonly maxConcurrentDownloads: number;
  readonly searchResultsCount: number;
  readonly queuePanelPosition: QueuePanelPosition;
  readonly embedMetadata: boolean;
  readonly hasSeenLegalNotice: boolean;
};

export const MAX_CONCURRENT_DOWNLOADS_HARD_CAP = 6;
export const SEARCH_RESULTS_COUNT_HARD_CAP = 100;

export const DEFAULT_SETTINGS: Defaults = {
  language: "system",
  defaultAudioFormat: "mp3",
  defaultAudioBitrateKbps: "max",
  defaultAudioQualityMode: "vbr",
  downloadFolder: "",
  maxConcurrentDownloads: 3,
  searchResultsCount: 30,
  queuePanelPosition: "bottom",
  embedMetadata: true,
  hasSeenLegalNotice: false,
};
