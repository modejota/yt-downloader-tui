import { DomainError } from "@/errors/domain-error";

/** Injectable clock so tests can skip real backoff waits. Defaults to a real timer. */
export type Delay = (milliseconds: number) => Promise<void>;

export const realDelay: Delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MS: readonly number[] = [2000, 4000, 8000];

function isRetryableFailure(cause: unknown): cause is DomainError {
  return cause instanceof DomainError && cause.kind === "network";
}

export async function withNetworkRetry<Result>(
  operation: () => Promise<Result>,
  delay: Delay,
  attempt = 1,
): Promise<Result> {
  try {
    return await operation();
  } catch (cause) {
    if (!isRetryableFailure(cause) || attempt >= MAX_ATTEMPTS) throw cause;
    const waitMs = RETRY_DELAYS_MS[attempt - 1];
    if (waitMs !== undefined) await delay(waitMs);
    return withNetworkRetry(operation, delay, attempt + 1);
  }
}
