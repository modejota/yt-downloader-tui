import { palette } from "@/ui/theme";
import { Card } from "@/ui/components/chrome";

export type MediaDetailRow = {
  readonly label: string;
  readonly value: string;
};

export function MediaCard({
  title,
  meta,
  badge,
  details,
}: {
  readonly title: string;
  readonly meta: readonly string[];
  readonly badge?: string;
  readonly details?: readonly MediaDetailRow[];
}) {
  return (
    <Card>
      {badge !== undefined ? <text fg={palette.gold}>{badge}</text> : undefined}
      <text fg={palette.text}>{title}</text>
      {meta.length > 0 ? <text fg={palette.dim}>{meta.join("  ·  ")}</text> : undefined}
      {(details ?? []).map((row) => (
        <text key={row.label}>
          <span fg={palette.dim}>{row.label}: </span>
          <span fg={palette.gold}>{row.value}</span>
        </text>
      ))}
    </Card>
  );
}
