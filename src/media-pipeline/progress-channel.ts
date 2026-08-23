/** A single-consumer async channel: push values or finish (optionally with a failure cause). */
export type ProgressChannel<T> = {
  readonly push: (value: T) => void;
  readonly finish: (cause?: unknown) => void;
  readonly stream: () => AsyncGenerator<T>;
};

export function createProgressChannel<T>(): ProgressChannel<T> {
  const queued: T[] = [];
  let failure: { readonly cause: unknown } | undefined;
  let isFinished = false;
  let wake: (() => void) | undefined;

  function notify(): void {
    const current = wake;
    wake = undefined;
    current?.();
  }

  return {
    push(value: T): void {
      queued.push(value);
      notify();
    },
    finish(cause?: unknown): void {
      isFinished = true;
      if (cause !== undefined) failure = { cause };
      notify();
    },
    async *stream(): AsyncGenerator<T> {
      while (true) {
        const next = queued.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        if (isFinished) break;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      if (failure !== undefined) throw failure.cause;
    },
  };
}
