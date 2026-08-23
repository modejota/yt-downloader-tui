import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ALL_FORMATS, FilePathSource, Input } from "mediabunny";

import type { ConversionSpec } from "@/domain/ports";
import { createMediaPipeline } from "@/media-pipeline/index";

/** Builds a tiny, valid, uncompressed WAV file: silence is enough to exercise the codec pipeline. */
function buildSyntheticWav(): Uint8Array {
  const sampleRate = 8000;
  const numSamples = 1600; // 0.2s
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++)
      view.setUint8(offset + index, text.charCodeAt(index));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // A quiet tone rather than pure silence, so the encoder has real (if trivial) signal to work with.
  for (let sample = 0; sample < numSamples; sample++) {
    const value = Math.round(Math.sin((sample / sampleRate) * 440 * 2 * Math.PI) * 1000);
    view.setInt16(44 + sample * 2, value, true);
  }

  return new Uint8Array(buffer);
}

/** Serves the given bytes over HTTP in a few separate chunks, so download progress fires more than once. */
function serveInChunks(bytes: Uint8Array) {
  const chunkCount = 4;
  const chunkSize = Math.ceil(bytes.length / chunkCount);

  const server = Bun.serve({
    port: 0,
    fetch() {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            controller.enqueue(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
          }
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "content-length": String(bytes.length) },
      });
    },
  });

  return { url: `http://localhost:${server.port}/source.wav`, stop: () => server.stop(true) };
}

/** Serves a fixed byte payload once per request, with the given content-type — for small fixtures
 * (a thumbnail image, a subtitle file) where chunking/progress isn't the point of the test. */
function serveOnce(bytes: Uint8Array, contentType: string) {
  const server = Bun.serve({
    port: 0,
    fetch() {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
      return new Response(stream, { headers: { "content-type": contentType } });
    },
  });
  return { url: `http://localhost:${server.port}/asset`, stop: () => server.stop(true) };
}

describe("media-pipeline module", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-dl-media-pipeline-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("transcodes a combined audio source to MP3 and writes a valid output file", async () => {
    const source = serveInChunks(buildSyntheticWav());
    const destinationPath = path.join(tempDir, "output.mp3");

    const spec: ConversionSpec = {
      source: {
        role: "combined",
        format: {
          role: "audio-only",
          formatId: "test-audio",
          url: source.url,
          container: "webm",
          audioCodec: "opus",
          bitrateBps: 128000,
          approximateSizeBytes: undefined,
        },
      },
      selection: {
        kind: "audio",
        format: "mp3",
        bitrateKbps: 64,
        qualityMode: "cbr",
        trim: undefined,
      },
      destinationPath,
      metadata: undefined,
    };

    const pipeline = createMediaPipeline();
    const events = [];
    try {
      for await (const event of pipeline.convert(spec, new AbortController().signal)) {
        events.push(event);
      }
    } finally {
      source.stop();
    }

    expect(events.some((event) => event.stage === "downloading")).toBe(true);
    const convertingEvents = events.filter((event) => event.stage === "converting");
    expect(convertingEvents.length).toBeGreaterThan(0);
    expect(
      convertingEvents.every((event) => event.stage === "converting" && event.mode === "transcode"),
    ).toBe(true);
    expect(events.at(-1)).toEqual({ stage: "done", outputPath: destinationPath });

    const outputStats = await fs.stat(destinationPath);
    expect(outputStats.size).toBeGreaterThan(0);

    const verifyInput = new Input({
      source: new FilePathSource(destinationPath),
      formats: ALL_FORMATS,
    });
    const audioTracks = await verifyInput.getAudioTracks();
    expect(audioTracks.length).toBe(1);
    const codec = await audioTracks[0]?.getCodec();
    expect(codec).toBe("mp3");
    verifyInput.dispose();
  }, 30000);

  it("embeds title/artist tags and cover art into the produced MP3, reporting a tagging stage", async () => {
    const source = serveInChunks(buildSyntheticWav());
    const thumbnail = serveOnce(new Uint8Array([1, 2, 3, 4, 5]), "image/jpeg");
    const destinationPath = path.join(tempDir, "output.mp3");

    const spec: ConversionSpec = {
      source: {
        role: "combined",
        format: {
          role: "audio-only",
          formatId: "test-audio",
          url: source.url,
          container: "webm",
          audioCodec: "opus",
          bitrateBps: 128000,
          approximateSizeBytes: undefined,
        },
      },
      selection: {
        kind: "audio",
        format: "mp3",
        bitrateKbps: 64,
        qualityMode: "cbr",
        trim: undefined,
      },
      destinationPath,
      metadata: { title: "Test Title", artist: "Test Channel", thumbnailUrl: thumbnail.url },
    };

    const pipeline = createMediaPipeline();
    const events = [];
    try {
      for await (const event of pipeline.convert(spec, new AbortController().signal)) {
        events.push(event);
      }
    } finally {
      source.stop();
      thumbnail.stop();
    }

    expect(events.some((event) => event.stage === "tagging")).toBe(true);
    expect(events.at(-1)).toEqual({ stage: "done", outputPath: destinationPath });

    const verifyInput = new Input({
      source: new FilePathSource(destinationPath),
      formats: ALL_FORMATS,
    });
    const tags = await verifyInput.getMetadataTags();
    expect(tags.title).toBe("Test Title");
    expect(tags.artist).toBe("Test Channel");
    expect(tags.images?.length).toBe(1);
    expect(tags.images?.[0]?.mimeType).toBe("image/jpeg");
    expect(tags.images?.[0]?.data.length).toBe(5);
    verifyInput.dispose();
  }, 30000);
});
