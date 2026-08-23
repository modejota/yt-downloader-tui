import { palette } from "@/ui/theme";

export function ProgressBar({
  ratio,
  width = 20,
  color = palette.gold,
}: {
  readonly ratio: number;
  readonly width?: number;
  readonly color?: string;
}) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const filled = Math.round(clamped * width);

  return (
    <text>
      <span fg={color}>{"█".repeat(filled)}</span>
      <span fg={palette.dimmer}>{"░".repeat(width - filled)}</span>
      <span fg={palette.dim}> {Math.round(clamped * 100)}%</span>
    </text>
  );
}
