import type { FormatCandidate, MediaSelection } from "@/domain/media";
import { selectConversionSource } from "@/download-queue/select-conversion-source";
import { outputExtension } from "@/ui/format-options";
import type { MediaDetailRow } from "@/ui/components/media-card";
import { i18n } from "@/i18n/index";

export function estimateBytes(candidates: readonly FormatCandidate[]): number {
  return selectConversionSource(candidates)?.approximateSizeBytes ?? 0;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function mediaDetails(
  title: string,
  selection: MediaSelection,
  estimatedBytes: number,
): MediaDetailRow[] {
  const quality =
    selection.bitrateKbps === "max"
      ? i18n.t("formatSummary.bestAvailable")
      : `${selection.bitrateKbps} kbps`;
  const rows: MediaDetailRow[] = [
    { label: i18n.t("formatSummary.formatLabel"), value: selection.format.toUpperCase() },
    { label: i18n.t("formatSummary.qualityLabel"), value: quality },
    {
      label: i18n.t("formatSummary.fileLabel"),
      value: `${title}.${outputExtension(selection)}`,
    },
  ];
  if (estimatedBytes > 0) {
    rows.push({
      label: i18n.t("formatSummary.sizeLabel"),
      value: `≈ ${formatBytes(estimatedBytes)}`,
    });
  }
  return rows;
}
