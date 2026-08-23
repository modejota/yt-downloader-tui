import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import * as v from "valibot";

import type { Defaults } from "@/domain/config";
import {
  DEFAULT_SETTINGS,
  MAX_CONCURRENT_DOWNLOADS_HARD_CAP,
  SEARCH_RESULTS_COUNT_HARD_CAP,
} from "@/domain/config";
import { defaultDownloadsFolder } from "@/filesystem/index";

const positiveIntegerOrMax = v.union([
  v.literal("max"),
  v.pipe(v.number(), v.integer(), v.minValue(1)),
]);

export function defaultsSchema(downloadFolderFallback: string) {
  const fieldsSchema = v.object({
    language: v.fallback(v.picklist(["en", "es", "system"]), DEFAULT_SETTINGS.language),
    defaultAudioFormat: v.fallback(
      v.picklist(["aac", "flac", "mp3", "opus", "wav"]),
      DEFAULT_SETTINGS.defaultAudioFormat,
    ),
    defaultAudioBitrateKbps: v.fallback(
      positiveIntegerOrMax,
      DEFAULT_SETTINGS.defaultAudioBitrateKbps,
    ),
    defaultAudioQualityMode: v.fallback(
      v.picklist(["cbr", "vbr"]),
      DEFAULT_SETTINGS.defaultAudioQualityMode,
    ),
    downloadFolder: v.fallback(v.pipe(v.string(), v.minLength(1)), downloadFolderFallback),
    maxConcurrentDownloads: v.fallback(
      v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_CONCURRENT_DOWNLOADS_HARD_CAP)),
      DEFAULT_SETTINGS.maxConcurrentDownloads,
    ),
    searchResultsCount: v.fallback(
      v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(SEARCH_RESULTS_COUNT_HARD_CAP)),
      DEFAULT_SETTINGS.searchResultsCount,
    ),
    queuePanelPosition: v.fallback(
      v.picklist(["bottom", "left", "right", "top"]),
      DEFAULT_SETTINGS.queuePanelPosition,
    ),
    embedMetadata: v.fallback(v.boolean(), DEFAULT_SETTINGS.embedMetadata),
    hasSeenLegalNotice: v.fallback(v.boolean(), DEFAULT_SETTINGS.hasSeenLegalNotice),
  });

  return v.fallback(fieldsSchema, {
    ...DEFAULT_SETTINGS,
    downloadFolder: downloadFolderFallback,
  }) satisfies v.GenericSchema<unknown, Defaults>;
}

/** OS-appropriate config file path for yt-downloader-tui. */
export function configFilePath(): string {
  if (process.platform === "win32") {
    const appData = process.env["APPDATA"] ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "yt-downloader-tui", "config.json");
  }

  const xdgConfigHome = process.env["XDG_CONFIG_HOME"] ?? path.join(os.homedir(), ".config");
  return path.join(xdgConfigHome, "yt-downloader-tui", "config.json");
}

export async function loadDefaults(configPath: string = configFilePath()): Promise<Defaults> {
  const schema = defaultsSchema(defaultDownloadsFolder());

  try {
    const text = await fs.readFile(configPath, "utf-8");
    return v.parse(schema, JSON.parse(text));
  } catch {
    return v.parse(schema, {});
  }
}

export async function saveDefaults(
  partial: Partial<Defaults>,
  configPath: string = configFilePath(),
): Promise<Defaults> {
  const current = await loadDefaults(configPath);
  const merged = { ...current, ...partial };
  const validated = v.parse(defaultsSchema(defaultDownloadsFolder()), merged);

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(validated, null, 2));
  return validated;
}
