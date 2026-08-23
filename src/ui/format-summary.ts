import type { FormatCandidate, MediaSelection } from "@/domain/media";
import { selectConversionSource } from "@/download-queue/select-conversion-source";
import { outputExtension } from "@/ui/format-options";
import type { MediaDetailRow } from "@/ui/components/media-card";
import { i18n } from "@/i18n/index";

type MediaSelectionDetails = {
  readonly format: string;
  readonly quality: string;
};

function selectionDetails(selection: MediaSelection): MediaSelectionDetails {
  const quality =
    selection.bitrateKbps === "max"
      ? i18n.t("formatSummary.bestAvailable")
      : `${selection.bitrateKbps} kbps`;
  return { format: selection.format.toUpperCase(), quality };
}

export function estimateBytes(candidates: readonly FormatCandidate[]): number {
  try {
    const source = selectConversionSource(candidates);
    return source.format.approximateSizeBytes ?? 0;
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function outputFileName(title: string, selection: MediaSelection): string {
  return `${title}.${outputExtension(selection)}`;
}

export function mediaDetails(
  title: string,
  selection: MediaSelection,
  estimatedBytes: number,
): MediaDetailRow[] {
  const details = selectionDetails(selection);
  const rows: MediaDetailRow[] = [
    { label: i18n.t("formatSummary.formatLabel"), value: details.format },
    { label: i18n.t("formatSummary.qualityLabel"), value: details.quality },
    { label: i18n.t("formatSummary.fileLabel"), value: outputFileName(title, selection) },
  ];
  if (estimatedBytes > 0) {
    rows.push({
      label: i18n.t("formatSummary.sizeLabel"),
      value: `≈ ${formatBytes(estimatedBytes)}`,
    });
  }
  return rows;
}
