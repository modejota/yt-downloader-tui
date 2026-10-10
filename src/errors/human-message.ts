import { i18n } from "@/i18n/index";
import { DomainError, type DomainErrorKind } from "@/errors/domain-error";

const KEY_BY_KIND = {
  "video-unavailable": "errors.videoUnavailable",
  "unsupported-source": "errors.unsupportedSource",
  network: "errors.network",
  "disk-space": "errors.diskSpace",
  "filesystem-permission": "errors.filesystemPermission",
  "format-unavailable": "errors.formatUnavailable",
  conversion: "errors.conversion",
  unknown: "errors.unknown",
} satisfies Record<DomainErrorKind, string>;

export function toHumanMessage(error: DomainError): string {
  return i18n.t(KEY_BY_KIND[error.kind], error.context);
}

/**
 * What the user is told when an operation fails: a DomainError's human message, or the caller's
 * generic `fallback` for anything unexpected — never a raw error or stack trace.
 */
export function failureMessage(cause: unknown, fallback: string): string {
  return cause instanceof DomainError ? toHumanMessage(cause) : fallback;
}
