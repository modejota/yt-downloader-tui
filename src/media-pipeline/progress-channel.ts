/** A single-consumer async channel bridging push-style callbacks to a pull-style async generator. */
export type ProgressChannel<T> = {
  readonly push: (value: T) => void;
  /** Ends the stream normally once every queued value has been consumed. */
  readonly close: () => void;
  /** Ends the stream by throwing `cause` once every queued value has been consumed. */
  readonly fail: (cause: unknown) => void;
  readonly stream: () => AsyncGenerator<T>;
};

type ChannelEnd =
  | { readonly kind: "closed" }
  | { readonly kind: "failed"; readonly cause: unknown };

export function createProgressChannel<T>(): ProgressChannel<T> {
  const queued: T[] = [];
  let end: ChannelEnd | undefined;
  let wake: (() => void) | undefined;

  function settle(channelEnd: ChannelEnd): void {
    end = channelEnd;
    notify();
  }

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
    close: () => settle({ kind: "closed" }),
    fail: (cause) => settle({ kind: "failed", cause }),
    async *stream(): AsyncGenerator<T> {
      while (true) {
        if (queued.length > 0) {
          yield* queued.splice(0);
          continue;
        }
        if (end !== undefined) break;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      if (end.kind === "failed") throw end.cause;
    },
  };
}
