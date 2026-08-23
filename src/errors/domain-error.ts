export type DomainErrorKind =
  | "conversion"
  | "disk-space"
  | "filesystem-permission"
  | "format-unavailable"
  | "network"
  | "unsupported-source"
  | "unknown"
  | "video-unavailable";

export class DomainError extends Error {
  readonly kind: DomainErrorKind;
  readonly context: Readonly<Record<string, string>>;

  constructor(
    kind: DomainErrorKind,
    message: string,
    context: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "DomainError";
    this.kind = kind;
    this.context = context;
  }
}
