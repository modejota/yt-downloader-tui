import { DomainError } from "@/errors/domain-error";

/** Injectable clock so tests can skip real backoff waits. Defaults to a real timer. */
export type Delay = (milliseconds: number) => Promise<void>;

export const realDelay: Delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/** One backoff wait between consecutive attempts: four attempts in total. */
const RETRY_DELAYS_MS = [2000, 4000, 8000] as const;

/** Runs `operation`, retrying network DomainErrors with exponential backoff; anything else fails fast. */
export async function withNetworkRetry<Result>(
  operation: () => Promise<Result>,
  delay: Delay,
): Promise<Result> {
  for (const waitMs of RETRY_DELAYS_MS) {
    try {
      return await operation();
    } catch (cause) {
      if (!(cause instanceof DomainError) || cause.kind !== "network") throw cause;
    }
    await delay(waitMs);
  }
  return operation();
}
