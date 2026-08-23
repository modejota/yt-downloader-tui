import { i18n } from "@/i18n/index";
import type { DomainError, DomainErrorKind } from "@/errors/domain-error";

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
  if (error.kind === "format-unavailable" && error.context["usedQuality"] !== undefined) {
    return i18n.t("errors.formatUnavailableWithFallback", error.context);
  }
  return i18n.t(KEY_BY_KIND[error.kind], error.context);
}
