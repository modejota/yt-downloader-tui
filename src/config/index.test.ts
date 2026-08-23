import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import * as v from "valibot";

import {
  DEFAULT_SETTINGS,
  MAX_CONCURRENT_DOWNLOADS_HARD_CAP,
  SEARCH_RESULTS_COUNT_HARD_CAP,
} from "@/domain/config";
import { defaultDownloadsFolder } from "@/filesystem/index";
import { configFilePath, defaultsSchema, loadDefaults, saveDefaults } from "@/config/index";

const schema = defaultsSchema(defaultDownloadsFolder());

describe("defaultsSchema", () => {
  it("accepts a valid full object", () => {
    const input = { ...DEFAULT_SETTINGS, downloadFolder: defaultDownloadsFolder() };
    expect(v.parse(schema, input)).toEqual(input);
  });

  it("fills every field with defaults for an empty object", () => {
    const result = v.parse(schema, {});
    expect(result.defaultAudioFormat).toBe(DEFAULT_SETTINGS.defaultAudioFormat);
    expect(result.downloadFolder).toBe(defaultDownloadsFolder());
    expect(result.maxConcurrentDownloads).toBe(DEFAULT_SETTINGS.maxConcurrentDownloads);
  });

  it("falls back to the real downloads folder when downloadFolder is empty", () => {
    expect(v.parse(schema, { downloadFolder: "" }).downloadFolder).toBe(defaultDownloadsFolder());
  });

  it("keeps a non-empty downloadFolder as-is", () => {
    expect(v.parse(schema, { downloadFolder: "/custom/path" }).downloadFolder).toBe("/custom/path");
  });

  describe("language", () => {
    it("accepts valid values", () => {
      expect(v.parse(schema, { language: "en" }).language).toBe("en");
      expect(v.parse(schema, { language: "es" }).language).toBe("es");
      expect(v.parse(schema, { language: "system" }).language).toBe("system");
    });

    it("falls back for invalid values", () => {
      expect(v.parse(schema, { language: "fr" }).language).toBe(DEFAULT_SETTINGS.language);
      expect(v.parse(schema, { language: null }).language).toBe(DEFAULT_SETTINGS.language);
    });
  });

  describe("defaultAudioFormat", () => {
    it("accepts valid formats", () => {
      for (const format of ["aac", "flac", "mp3", "opus", "wav"] as const) {
        expect(v.parse(schema, { defaultAudioFormat: format }).defaultAudioFormat).toBe(format);
      }
    });

    it("falls back for invalid formats", () => {
      expect(v.parse(schema, { defaultAudioFormat: "invalid" }).defaultAudioFormat).toBe(
        DEFAULT_SETTINGS.defaultAudioFormat,
      );
      expect(v.parse(schema, { defaultAudioFormat: 123 }).defaultAudioFormat).toBe(
        DEFAULT_SETTINGS.defaultAudioFormat,
      );
    });
  });

  describe("defaultAudioBitrateKbps", () => {
    it("accepts 'max'", () => {
      expect(v.parse(schema, { defaultAudioBitrateKbps: "max" }).defaultAudioBitrateKbps).toBe(
        "max",
      );
    });

    it("accepts positive integers", () => {
      expect(v.parse(schema, { defaultAudioBitrateKbps: 320 }).defaultAudioBitrateKbps).toBe(320);
      expect(v.parse(schema, { defaultAudioBitrateKbps: 1 }).defaultAudioBitrateKbps).toBe(1);
    });

    it("falls back for invalid values", () => {
      expect(v.parse(schema, { defaultAudioBitrateKbps: 0 }).defaultAudioBitrateKbps).toBe(
        DEFAULT_SETTINGS.defaultAudioBitrateKbps,
      );
      expect(v.parse(schema, { defaultAudioBitrateKbps: -100 }).defaultAudioBitrateKbps).toBe(
        DEFAULT_SETTINGS.defaultAudioBitrateKbps,
      );
      expect(v.parse(schema, { defaultAudioBitrateKbps: 3.14 }).defaultAudioBitrateKbps).toBe(
        DEFAULT_SETTINGS.defaultAudioBitrateKbps,
      );
      expect(v.parse(schema, { defaultAudioBitrateKbps: "320" }).defaultAudioBitrateKbps).toBe(
        DEFAULT_SETTINGS.defaultAudioBitrateKbps,
      );
    });
  });

  describe("defaultAudioQualityMode", () => {
    it("accepts valid modes", () => {
      expect(v.parse(schema, { defaultAudioQualityMode: "cbr" }).defaultAudioQualityMode).toBe(
        "cbr",
      );
      expect(v.parse(schema, { defaultAudioQualityMode: "vbr" }).defaultAudioQualityMode).toBe(
        "vbr",
      );
    });

    it("falls back for invalid modes", () => {
      expect(v.parse(schema, { defaultAudioQualityMode: "abr" }).defaultAudioQualityMode).toBe(
        DEFAULT_SETTINGS.defaultAudioQualityMode,
      );
      expect(v.parse(schema, { defaultAudioQualityMode: 1 }).defaultAudioQualityMode).toBe(
        DEFAULT_SETTINGS.defaultAudioQualityMode,
      );
    });
  });

  describe("maxConcurrentDownloads", () => {
    it("accepts values within range", () => {
      expect(v.parse(schema, { maxConcurrentDownloads: 1 }).maxConcurrentDownloads).toBe(1);
      expect(v.parse(schema, { maxConcurrentDownloads: 3 }).maxConcurrentDownloads).toBe(3);
      expect(
        v.parse(schema, { maxConcurrentDownloads: MAX_CONCURRENT_DOWNLOADS_HARD_CAP })
          .maxConcurrentDownloads,
      ).toBe(MAX_CONCURRENT_DOWNLOADS_HARD_CAP);
    });

    it("falls back for out-of-range values", () => {
      expect(v.parse(schema, { maxConcurrentDownloads: 0 }).maxConcurrentDownloads).toBe(
        DEFAULT_SETTINGS.maxConcurrentDownloads,
      );
      expect(v.parse(schema, { maxConcurrentDownloads: -1 }).maxConcurrentDownloads).toBe(
        DEFAULT_SETTINGS.maxConcurrentDownloads,
      );
      expect(
        v.parse(schema, { maxConcurrentDownloads: MAX_CONCURRENT_DOWNLOADS_HARD_CAP + 1 })
          .maxConcurrentDownloads,
      ).toBe(DEFAULT_SETTINGS.maxConcurrentDownloads);
      expect(v.parse(schema, { maxConcurrentDownloads: 3.5 }).maxConcurrentDownloads).toBe(
        DEFAULT_SETTINGS.maxConcurrentDownloads,
      );
    });
  });

  describe("searchResultsCount", () => {
    it("accepts values within range", () => {
      expect(v.parse(schema, { searchResultsCount: 1 }).searchResultsCount).toBe(1);
      expect(v.parse(schema, { searchResultsCount: 15 }).searchResultsCount).toBe(15);
      expect(
        v.parse(schema, { searchResultsCount: SEARCH_RESULTS_COUNT_HARD_CAP }).searchResultsCount,
      ).toBe(SEARCH_RESULTS_COUNT_HARD_CAP);
    });

    it("falls back for out-of-range values", () => {
      expect(v.parse(schema, { searchResultsCount: 0 }).searchResultsCount).toBe(
        DEFAULT_SETTINGS.searchResultsCount,
      );
      expect(v.parse(schema, { searchResultsCount: -10 }).searchResultsCount).toBe(
        DEFAULT_SETTINGS.searchResultsCount,
      );
      expect(
        v.parse(schema, { searchResultsCount: SEARCH_RESULTS_COUNT_HARD_CAP + 1 })
          .searchResultsCount,
      ).toBe(DEFAULT_SETTINGS.searchResultsCount);
    });
  });

  describe("queuePanelPosition", () => {
    it("accepts valid positions", () => {
      for (const pos of ["bottom", "left", "right", "top"] as const) {
        expect(v.parse(schema, { queuePanelPosition: pos }).queuePanelPosition).toBe(pos);
      }
    });

    it("falls back for invalid positions", () => {
      expect(v.parse(schema, { queuePanelPosition: "center" }).queuePanelPosition).toBe(
        DEFAULT_SETTINGS.queuePanelPosition,
      );
      expect(v.parse(schema, { queuePanelPosition: 0 }).queuePanelPosition).toBe(
        DEFAULT_SETTINGS.queuePanelPosition,
      );
    });
  });

  describe("embedMetadata", () => {
    it("accepts boolean values", () => {
      expect(v.parse(schema, { embedMetadata: true }).embedMetadata).toBe(true);
      expect(v.parse(schema, { embedMetadata: false }).embedMetadata).toBe(false);
    });

    it("falls back for non-boolean values", () => {
      expect(v.parse(schema, { embedMetadata: "true" }).embedMetadata).toBe(
        DEFAULT_SETTINGS.embedMetadata,
      );
      expect(v.parse(schema, { embedMetadata: 1 }).embedMetadata).toBe(
        DEFAULT_SETTINGS.embedMetadata,
      );
      expect(v.parse(schema, { embedMetadata: null }).embedMetadata).toBe(
        DEFAULT_SETTINGS.embedMetadata,
      );
    });
  });

  it("falls back independently per field when some are valid and some invalid", () => {
    const input = {
      defaultAudioFormat: "invalid-format", // invalid
      maxConcurrentDownloads: 2, // valid
      searchResultsCount: 999_999, // invalid (out of range)
      downloadFolder: "/home/user", // valid
    };

    const result = v.parse(schema, input);

    expect(result.defaultAudioFormat).toBe(DEFAULT_SETTINGS.defaultAudioFormat);
    expect(result.maxConcurrentDownloads).toBe(2);
    expect(result.searchResultsCount).toBe(DEFAULT_SETTINGS.searchResultsCount);
    expect(result.downloadFolder).toBe("/home/user");
  });

  it("falls back to full defaults for non-object input", () => {
    for (const garbage of [null, "not an object", 42, [1, 2, 3]]) {
      expect(v.parse(schema, garbage).downloadFolder).toBe(defaultDownloadsFolder());
    }
  });
});

describe("configFilePath", () => {
  it("returns a path under yt-downloader-tui/config.json", () => {
    const filePath = configFilePath();
    expect(filePath).toContain("yt-downloader-tui");
    expect(filePath.endsWith("config.json")).toBe(true);
  });

  it("uses APPDATA on Windows", () => {
    if (process.platform !== "win32") return;
    expect(configFilePath().startsWith(process.env["APPDATA"] ?? "")).toBe(true);
  });

  it("falls back to the home directory config folder off Windows", () => {
    if (process.platform === "win32") return;
    const expectedRoot = process.env["XDG_CONFIG_HOME"] ?? path.join(os.homedir(), ".config");
    expect(configFilePath().startsWith(expectedRoot)).toBe(true);
  });
});

describe("loadDefaults and saveDefaults", () => {
  let tempConfigPath: string;

  afterEach(async () => {
    await fs.rm(path.dirname(tempConfigPath), { recursive: true, force: true });
  });

  it("returns defaults when the config file doesn't exist", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-downloader-config-test-"));
    tempConfigPath = path.join(tempDir, "config.json");

    const result = await loadDefaults(tempConfigPath);
    expect(result.downloadFolder).toBe(defaultDownloadsFolder());
  });

  it("creates the parent directory and persists a partial update", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-downloader-config-test-"));
    tempConfigPath = path.join(tempDir, "nested", "config.json");

    await saveDefaults({ maxConcurrentDownloads: 5 }, tempConfigPath);
    const result = await loadDefaults(tempConfigPath);

    expect(result.maxConcurrentDownloads).toBe(5);
  });

  it("merges a partial update on top of the previously saved defaults", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-downloader-config-test-"));
    tempConfigPath = path.join(tempDir, "config.json");

    await saveDefaults({ maxConcurrentDownloads: 5 }, tempConfigPath);
    await saveDefaults({ defaultAudioBitrateKbps: 192 }, tempConfigPath);
    const result = await loadDefaults(tempConfigPath);

    expect(result.maxConcurrentDownloads).toBe(5);
    expect(result.defaultAudioBitrateKbps).toBe(192);
  });

  it("re-validates on save, so an out-of-range value cannot be persisted", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-downloader-config-test-"));
    tempConfigPath = path.join(tempDir, "config.json");

    await saveDefaults({ maxConcurrentDownloads: 999_999 }, tempConfigPath);
    const result = await loadDefaults(tempConfigPath);

    expect(result.maxConcurrentDownloads).toBe(DEFAULT_SETTINGS.maxConcurrentDownloads);
  });
});
