import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  defaultDownloadsFolder,
  sanitizeFilename,
  resolveDownloadDirectory,
  resolveDestination,
  ensureWritable,
  checkDiskSpaceFor,
} from "@/filesystem/index";
import { DomainError } from "@/errors/domain-error";

describe("filesystem module", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-dl-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("defaultDownloadsFolder", () => {
    it("returns a path under home directory", () => {
      const result = defaultDownloadsFolder();
      expect(result).toContain(os.homedir());
      expect(result).toContain("Downloads");
    });

    it("returns the same value on repeated calls", () => {
      const first = defaultDownloadsFolder();
      const second = defaultDownloadsFolder();
      expect(first).toBe(second);
    });
  });

  describe("sanitizeFilename", () => {
    it("removes Windows-invalid characters", () => {
      expect(sanitizeFilename("video<name>.mp4")).toBe("videoname.mp4");
      expect(sanitizeFilename('file"name.mp4')).toBe("filename.mp4");
      expect(sanitizeFilename("file:name.mp4")).toBe("filename.mp4");
      expect(sanitizeFilename("file|name.mp4")).toBe("filename.mp4");
      expect(sanitizeFilename("file/name.mp4")).toBe("filename.mp4");
      expect(sanitizeFilename("file\\name.mp4")).toBe("filename.mp4");
      expect(sanitizeFilename("file?name.mp4")).toBe("filename.mp4");
      expect(sanitizeFilename("file*name.mp4")).toBe("filename.mp4");
      expect(sanitizeFilename("file>name.mp4")).toBe("filename.mp4");
    });

    it("removes ASCII control characters", () => {
      expect(sanitizeFilename("file\x00name.mp4")).toBe("filename.mp4");
      expect(sanitizeFilename("file\x1fname.mp4")).toBe("filename.mp4");
    });

    it("trims trailing dots", () => {
      expect(sanitizeFilename("filename...")).toBe("filename");
      expect(sanitizeFilename("filename.mp4...")).toBe("filename.mp4");
    });

    it("trims trailing spaces", () => {
      expect(sanitizeFilename("filename   ")).toBe("filename");
      expect(sanitizeFilename("filename.mp4   ")).toBe("filename.mp4");
    });

    it("collapses repeated whitespace", () => {
      expect(sanitizeFilename("file    name.mp4")).toBe("file name.mp4");
      expect(sanitizeFilename("file\t\nname.mp4")).toBe("file name.mp4");
    });

    it("caps to 150 characters", () => {
      const longName = "a".repeat(200) + ".mp4";
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(150);
    });

    it("returns 'video' fallback for empty input", () => {
      expect(sanitizeFilename("")).toBe("video");
      expect(sanitizeFilename("   ")).toBe("video");
      expect(sanitizeFilename("...")).toBe("video");
      expect(sanitizeFilename("<>:|?*")).toBe("video");
    });

    it("handles complex mixed cases", () => {
      const result = sanitizeFilename("  file<>name:test.mp4  ");
      expect(result).toBe("filenametest.mp4");
    });
  });

  describe("resolveDownloadDirectory", () => {
    it("creates and returns the download folder when no playlist title", async () => {
      const result = await resolveDownloadDirectory(tempDir, undefined);
      expect(result).toBe(tempDir);
      const stat = await fs.stat(tempDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it("creates a sanitized playlist subfolder", async () => {
      const playlistTitle = "My <Playlist> Name: 2024";
      const result = await resolveDownloadDirectory(tempDir, playlistTitle);
      expect(result).toContain("My Playlist Name 2024");
      const stat = await fs.stat(result);
      expect(stat.isDirectory()).toBe(true);
    });

    it("handles existing directory", async () => {
      // Directory already exists from beforeEach
      const result = await resolveDownloadDirectory(tempDir, undefined);
      expect(result).toBe(tempDir);
    });

    it("creates nested directories recursively", async () => {
      const nested = path.join(tempDir, "sub", "nested");
      const result = await resolveDownloadDirectory(nested, undefined);
      expect(result).toBe(nested);
      const stat = await fs.stat(nested);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("resolveDestination", () => {
    it("returns the base filename when no collision", async () => {
      const result = await resolveDestination(tempDir, "video", "mp4");
      expect(result.directoryPath).toBe(tempDir);
      expect(result.fileName).toBe("video.mp4");
    });

    it("sanitizes the base filename", async () => {
      const result = await resolveDestination(tempDir, "my<video>name.txt", "mp4");
      expect(result.fileName).toBe("myvideoname.txt.mp4");
    });

    it("uses numeric suffix when file exists", async () => {
      // Create first file
      const firstPath = path.join(tempDir, "video.mp4");
      await fs.writeFile(firstPath, "");

      // Resolve destination for same name
      const result = await resolveDestination(tempDir, "video", "mp4");
      expect(result.fileName).toBe("video (2).mp4");
    });

    it("increments numeric suffix for multiple collisions", async () => {
      // Create first two files
      await fs.writeFile(path.join(tempDir, "video.mp4"), "");
      await fs.writeFile(path.join(tempDir, "video (2).mp4"), "");

      // Resolve destination
      const result = await resolveDestination(tempDir, "video", "mp4");
      expect(result.fileName).toBe("video (3).mp4");
    });

    it("handles gaps in numeric sequence", async () => {
      // Create files with gap: video.mp4 and video (3).mp4
      await fs.writeFile(path.join(tempDir, "video.mp4"), "");
      await fs.writeFile(path.join(tempDir, "video (3).mp4"), "");

      // Resolve destination
      const result = await resolveDestination(tempDir, "video", "mp4");
      expect(result.fileName).toBe("video (2).mp4");
    });

    it("returns correct directoryPath", async () => {
      const result = await resolveDestination(tempDir, "test", "txt");
      expect(result.directoryPath).toBe(tempDir);
    });
  });

  describe("ensureWritable", () => {
    it("creates directory if missing", async () => {
      const newDir = path.join(tempDir, "newdir");
      await ensureWritable(newDir);
      const stat = await fs.stat(newDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it("succeeds if directory already exists and is writable", async () => {
      await ensureWritable(tempDir);
      // Should not throw
      expect(true).toBe(true);
    });

    it("leaves no probe artifacts behind", async () => {
      const dir = path.join(tempDir, "probe");
      await ensureWritable(dir);
      const entries = await fs.readdir(dir);
      expect(entries).toEqual([]);
    });
  });

  describe("checkDiskSpaceFor", () => {
    it("succeeds when enough free space exists", async () => {
      // Ask for 1 byte - should always pass on any real system
      await checkDiskSpaceFor(tempDir, 1);
      // Should not throw
      expect(true).toBe(true);
    });

    it("throws DomainError with kind disk-space when insufficient space", async () => {
      try {
        // Ask for an absurdly large amount (more than 1 exabyte)
        await checkDiskSpaceFor(tempDir, Number.MAX_SAFE_INTEGER);
        throw new Error("Expected DomainError to be thrown");
      } catch (err) {
        if (err instanceof Error && err.message === "Expected DomainError to be thrown") {
          throw err;
        }
        if (err instanceof DomainError) {
          expect(err.kind).toBe("disk-space");
          expect(err.context.path).toBe(tempDir);
        } else {
          throw err;
        }
      }
    });

    it("includes path in error context", async () => {
      try {
        await checkDiskSpaceFor(tempDir, Number.MAX_SAFE_INTEGER);
      } catch (err) {
        if (err instanceof DomainError) {
          expect(err.context.path).toBe(tempDir);
        } else {
          throw err;
        }
      }
    });
  });
});
