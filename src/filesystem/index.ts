import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import checkDiskSpace from "check-disk-space";

import { DomainError } from "@/errors/domain-error";
import type { Destination } from "@/domain/queue";

const MAX_COLLISION_SUFFIX = 10000;

/** The user's platform downloads folder. */
export function defaultDownloadsFolder(): string {
  return path.join(os.homedir(), "Downloads");
}

/** Produces a filename safe on Windows, Linux, and macOS. */
export function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/[<>:"|/?\\*]/g, "")
    .replace(/\s+/g, " ")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 0x08 && (code < 0x0e || code > 0x1f) && code !== 0x7f;
    })
    .join("")
    .replace(/[\s.]+$/, "")
    .slice(0, 150)
    .trim();

  return sanitized || "video";
}

/** Creates the directory (and parents), reporting any failure as a "filesystem-permission" error. */
async function createDirectory(directoryPath: string): Promise<void> {
  try {
    await fs.mkdir(directoryPath, { recursive: true });
    return;
  } catch (cause) {
    // Bun on Windows leaks EEXIST from recursive mkdir for some existing system folders
    // (e.g. Downloads), so EEXIST is reconciled against a stat.
    const leakedExists = cause instanceof Error && "code" in cause && cause.code === "EEXIST";
    const existsAsDirectory =
      leakedExists && (await fs.stat(directoryPath).catch(() => undefined))?.isDirectory() === true;
    if (existsAsDirectory) return;
  }
  throw new DomainError("filesystem-permission", `Failed to create directory at ${directoryPath}`, {
    path: directoryPath,
  });
}

async function pathExists(filePath: string): Promise<boolean> {
  return fs.stat(filePath).then(
    () => true,
    () => false,
  );
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

  await createDirectory(targetPath);
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
  for (
    let counter = 2;
    counter <= MAX_COLLISION_SUFFIX && (await pathExists(path.join(directoryPath, fileName)));
    counter += 1
  ) {
    fileName = `${sanitized} (${counter}).${extension}`;
  }

  return { directoryPath, fileName };
}

/** Ensures the directory exists and is actually writable. */
export async function ensureWritable(directoryPath: string): Promise<void> {
  await createDirectory(directoryPath);

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
