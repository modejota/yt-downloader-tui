import { registerAacEncoder } from "@mediabunny/aac-encoder";
import { registerFlacEncoder } from "@mediabunny/flac-encoder";
import { registerMp3Encoder } from "@mediabunny/mp3-encoder";
import { registerMediabunnyServer } from "@mediabunny/server";
import { ALL_FORMATS, Input, ReadableStreamSource, canEncodeAudio } from "mediabunny";

import { DomainError } from "@/errors/domain-error";
import type { FormatCandidate } from "@/domain/media";

let codecsRegistered: Promise<void> | undefined;

/**
 * Registers mediabunny's server-side WebCodecs polyfill (`@mediabunny/server`, backed by NodeAV/
 * FFmpeg) plus the WASM MP3/AAC/FLAC encoder fallbacks, exactly once per process. Safe to call on
 * every conversion; the registration work itself only ever runs once.
 */
export function ensureCodecsRegistered(): Promise<void> {
  codecsRegistered ??= registerCodecs();
  return codecsRegistered;
}

async function registerCodecs(): Promise<void> {
  registerMediabunnyServer();

  // @mediabunny/server's NodeAV backend already covers most of these; only fall back to the WASM
  // encoders when the platform build genuinely lacks native support, per each package's own README.
  const [mp3Supported, aacSupported, flacSupported] = await Promise.all([
    canEncodeAudio("mp3"),
    canEncodeAudio("aac"),
    canEncodeAudio("flac"),
  ]);
  if (!mp3Supported) registerMp3Encoder();
  if (!aacSupported) registerAacEncoder();
  if (!flacSupported) registerFlacEncoder();
}

export async function openStreamedInput(
  candidate: FormatCandidate,
  signal: AbortSignal,
  onBytes: (chunkBytes: number, totalBytes: number | undefined) => void,
): Promise<Input> {
  const response = await fetchSource(candidate.url, signal);

  if (response.body === null) {
    throw new DomainError("network", "The source stream returned no data.", { url: candidate.url });
  }

  const contentLength = response.headers.get("content-length");
  const totalBytes = contentLength === null ? undefined : Number(contentLength);

  const trackedBody = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        onBytes(chunk.byteLength, totalBytes);
        controller.enqueue(chunk);
      },
    }),
  );

  return new Input({ source: new ReadableStreamSource(trackedBody), formats: ALL_FORMATS });
}

async function fetchSource(url: string, signal: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new DomainError("network", "Could not connect to download the media stream.", { url });
  }

  if (!response.ok) {
    throw new DomainError("network", `The media stream responded with status ${response.status}.`, {
      url,
      status: String(response.status),
    });
  }

  return response;
}
