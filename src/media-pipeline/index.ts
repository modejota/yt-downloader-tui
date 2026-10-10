import { Conversion, FilePathTarget, Output } from "mediabunny";

import { DomainError } from "@/errors/domain-error";
import type { ConversionProgress, ConversionSpec, MediaPipeline } from "@/domain/ports";

import { planAudioConversion } from "@/media-pipeline/conversion-plan";
import { createProgressChannel } from "@/media-pipeline/progress-channel";
import { ensureCodecsRegistered, openStreamedInput } from "@/media-pipeline/streamed-input";
import { fetchMetadataTags } from "@/media-pipeline/tagging";

type PushProgress = (event: ConversionProgress) => void;

export function createMediaPipeline(): MediaPipeline {
  return { convert };
}

async function* convert(
  spec: ConversionSpec,
  signal: AbortSignal,
): AsyncGenerator<ConversionProgress> {
  await ensureCodecsRegistered();

  const channel = createProgressChannel<ConversionProgress>();
  runConversion(spec, channel.push, signal).then(channel.close, (cause: unknown) =>
    channel.fail(signal.aborted ? cause : toDomainError(cause)),
  );

  yield* channel.stream();
}

/** One stream in, one file out: the audio track of a progressive or audio-only source. */
async function runConversion(
  spec: ConversionSpec,
  push: PushProgress,
  signal: AbortSignal,
): Promise<void> {
  const input = await openStreamedInput(spec.source, signal, (bytesReceived, bytesTotal) =>
    push({ stage: "downloading", bytesReceived, bytesTotal }),
  );

  try {
    const plan = planAudioConversion(spec.source, spec.selection);
    const output = new Output({
      format: plan.outputFormat,
      target: new FilePathTarget(spec.destinationPath),
    });
    const conversion = await Conversion.init({
      input,
      output,
      audio: plan.audio,
      video: { discard: true },
      trim: plan.trim,
      composable: true,
    });
    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks.map((discarded) => discarded.reason).join(", ");
      throw new DomainError("conversion", "Could not prepare the media conversion.", { reasons });
    }
    conversion.onProgress = (ratio) => push({ stage: "converting", ratio, mode: plan.mode });

    // mediabunny only accepts metadata before the output starts, so tagging is reported up front.
    if (spec.metadata !== undefined) {
      push({ stage: "tagging" });
      output.setMetadataTags(await fetchMetadataTags(spec.metadata, signal));
    }

    // Wire the AbortSignal to mediabunny's own cancel() so an in-flight conversion stops promptly.
    const cancel = () => void Promise.all([conversion.cancel(), output.cancel()]);
    signal.addEventListener("abort", cancel, { once: true });
    try {
      await output.start();
      await conversion.execute();
      await output.finalize();
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  } finally {
    input.dispose();
  }

  push({ stage: "done", outputPath: spec.destinationPath });
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
