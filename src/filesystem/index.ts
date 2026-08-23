import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import checkDiskSpace from "check-disk-space";

import { DomainError } from "@/errors/domain-error";
import type { Destination } from "@/domain/queue";

/** The user's platform downloads folder. */
export function defaultDownloadsFolder(): string {
  return path.join(os.homedir(), "Downloads");
}

/** Produces a filename safe on Windows, Linux, and macOS. */
export function sanitizeFilename(name: string): string {
  let sanitized = name.replace(/[<>:"|/?\\*]/g, "");

  sanitized = sanitized.replace(/\s+/g, " ");

  sanitized = sanitized
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      if (code <= 0x08) return false;
      if (code >= 0x0e && code <= 0x1f) return false;
      if (code === 0x7f) return false;
      return true;
    })
    .join("");

  sanitized = sanitized.replace(/[\s.]+$/, "");

  sanitized = sanitized.slice(0, 150);

  return sanitized.trim() || "video";
}

// Bun on Windows leaks EEXIST from recursive mkdir for some existing system
// folders (e.g. Downloads), so EEXIST is reconciled against a stat.
async function ensureDirectoryExists(directoryPath: string): Promise<void> {
  try {
    await fs.mkdir(directoryPath, { recursive: true });
  } catch (cause) {
    const error = cause as NodeJS.ErrnoException;
    if (error.code !== "EEXIST") throw cause;
    const stat = await fs.stat(directoryPath).catch(() => undefined);
    if (stat?.isDirectory() !== true) throw cause;
  }
}

/** Resolves (and creates) the download directory; playlists get a subfolder. */
export async function resolveDownloadDirectory(
  downloadFolder: string,
  playlistTitle: string | undefined,
): Promise<string> {
  const targetPath =
    playlistTitle === undefined
      ? downloadFolder
      : path.join(downloadFolder, sanitizeFilename(playlistTitle));

  try {
    await ensureDirectoryExists(targetPath);
  } catch {
    throw new DomainError("filesystem-permission", `Failed to create directory at ${targetPath}`, {
      path: targetPath,
    });
  }
  return targetPath;
}

/** Resolves a destination filename, uniquified with numeric suffixes on collision. */
export async function resolveDestination(
  directoryPath: string,
  baseFileName: string,
  extension: string,
): Promise<Destination> {
  const sanitized = sanitizeFilename(baseFileName);

  let fileName = `${sanitized}.${extension}`;
  let filePath = path.join(directoryPath, fileName);

  let exists = false;
  try {
    await fs.stat(filePath);
    exists = true;
  } catch {
    exists = false;
  }

  if (exists) {
    let counter = 2;
    while (counter <= 10000) {
      fileName = `${sanitized} (${counter}).${extension}`;
      filePath = path.join(directoryPath, fileName);
      try {
        await fs.stat(filePath);
        counter++;
      } catch {
        break;
      }
    }
  }

  return { directoryPath, fileName };
}

/** Ensures the directory exists and is actually writable. */
export async function ensureWritable(directoryPath: string): Promise<void> {
  try {
    await ensureDirectoryExists(directoryPath);
  } catch {
    throw new DomainError(
      "filesystem-permission",
      `Failed to create directory at ${directoryPath}`,
      { path: directoryPath },
    );
  }

  // fs.access(W_OK) lies about Windows folders flagged read-only (Downloads);
  // a real create-then-remove probe is the only cross-platform truth.
  const probePath = path.join(
    directoryPath,
    `.yt-write-probe-${process.pid}-${Date.now().toString(36)}`,
  );
  try {
    const handle = await fs.open(probePath, "wx");
    await handle.close();
  } catch {
    throw new DomainError(
      "filesystem-permission",
      `No write permission for directory at ${directoryPath}`,
      { path: directoryPath },
    );
  }
  await fs.rm(probePath, { force: true }).catch(() => undefined);
}

/** Throws a "disk-space" DomainError when free space is below the estimate. */
export async function checkDiskSpaceFor(
  directoryPath: string,
  estimatedBytes: number,
): Promise<void> {
  const diskSpace = await checkDiskSpace(directoryPath);
  if (diskSpace.free < estimatedBytes) {
    throw new DomainError("disk-space", `Insufficient disk space at ${directoryPath}`, {
      path: directoryPath,
    });
  }
}
