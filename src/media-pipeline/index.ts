import { Conversion, FilePathTarget, Output } from "mediabunny";

import { DomainError } from "@/errors/domain-error";
import type { FormatCandidate } from "@/domain/media";
import type { ConversionProgress, ConversionSpec, MediaPipeline } from "@/domain/ports";

import {
  pickOutputFormat,
  requireAudioTrack,
  resolveAudioConversionPlan,
  toTrimOption,
} from "@/media-pipeline/conversion-plan";
import { createProgressChannel } from "@/media-pipeline/progress-channel";
import { ensureCodecsRegistered, openStreamedInput } from "@/media-pipeline/streamed-input";
import { prepareTagging } from "@/media-pipeline/tagging";

type PushProgress = (event: ConversionProgress) => void;
type Cancelable = { readonly cancel: () => Promise<void> };

export function createMediaPipeline(): MediaPipeline {
  return { convert };
}

async function* convert(
  spec: ConversionSpec,
  signal: AbortSignal,
): AsyncGenerator<ConversionProgress> {
  await ensureCodecsRegistered();

  const channel = createProgressChannel<ConversionProgress>();
  runConversion(spec, channel.push, signal).then(
    () => channel.finish(),
    (cause: unknown) => channel.finish(signal.aborted ? cause : toDomainError(cause)),
  );

  yield* channel.stream();
}

async function runConversion(
  spec: ConversionSpec,
  push: PushProgress,
  signal: AbortSignal,
): Promise<void> {
  await convertCombined(spec, spec.source.format, push, signal);
  push({ stage: "done", outputPath: spec.destinationPath });
}

/** One stream in, one file out: the audio track of a progressive or audio-only source. */
async function convertCombined(
  spec: ConversionSpec,
  candidate: FormatCandidate,
  push: PushProgress,
  signal: AbortSignal,
): Promise<void> {
  let bytesReceived = 0;
  let bytesTotal: number | undefined;
  const input = await openStreamedInput(candidate, signal, (chunkBytes, totalBytes) => {
    bytesReceived += chunkBytes;
    bytesTotal = totalBytes;
    push({ stage: "downloading", bytesReceived, bytesTotal });
  });

  try {
    const output = new Output({
      format: pickOutputFormat(spec.selection),
      target: new FilePathTarget(spec.destinationPath),
    });
    const trim = toTrimOption(spec.selection.trim);

    const { audioCodec, bitrateBps } = requireAudioTrack(candidate);
    const plan = resolveAudioConversionPlan(audioCodec, bitrateBps, spec.selection);
    const conversion = await Conversion.init({
      input,
      output,
      audio: plan.options,
      video: { discard: true },
      trim,
      composable: true,
    });

    assertConversionValid(conversion);
    conversion.onProgress = (ratio) => {
      push({ stage: "converting", ratio, mode: plan.isRemux ? "remux" : "transcode" });
    };

    await tagAndFinalize(output, [conversion], spec, push, signal);
  } finally {
    input.dispose();
  }
}

/** Metadata must be set before the output starts (mediabunny requirement). */
async function tagAndFinalize(
  output: Output,
  conversions: readonly Conversion[],
  spec: ConversionSpec,
  push: PushProgress,
  signal: AbortSignal,
): Promise<void> {
  if (spec.metadata !== undefined) push({ stage: "tagging" });
  await prepareTagging(output, spec, signal);

  const detach = cancelOnAbort(signal, [...conversions, output]);
  try {
    await output.start();
    await Promise.all(conversions.map((conversion) => conversion.execute()));
    await output.finalize();
  } finally {
    detach();
  }
}

function assertConversionValid(conversion: Conversion): void {
  if (conversion.isValid) return;
  const reasons = conversion.discardedTracks.map((discarded) => discarded.reason).join(", ");
  throw new DomainError("conversion", "Could not prepare the media conversion.", { reasons });
}

/** Wires an AbortSignal to mediabunny's own cancel() so an in-flight conversion stops promptly. */
function cancelOnAbort(signal: AbortSignal, cancelables: readonly Cancelable[]): () => void {
  const onAbort = () => {
    for (const cancelable of cancelables) void cancelable.cancel();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

function toDomainError(cause: unknown): DomainError {
  if (cause instanceof DomainError) return cause;
  if (cause instanceof Error) {
    return new DomainError("conversion", "The media could not be converted.", {
      message: cause.message,
    });
  }
  return new DomainError("unknown", "An unexpected error occurred while processing the media.");
}
