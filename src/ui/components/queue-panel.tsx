import { useTerminalDimensions } from "@opentui/react";
import { useTranslation } from "react-i18next";

import type { QueuePanelPosition } from "@/domain/config";
import { STATUS_DOT, palette } from "@/ui/theme";
import { isJobActive, jobProgressRatio, jobStatusColor } from "@/ui/job-progress";
import { truncateText } from "@/ui/truncate";
import { useQueueStore } from "@/ui/queue-store";
import { ProgressBar } from "@/ui/components/progress-bar";

const BAR_WIDTH = 22;
const SIDEWAYS_WIDTH = 60;

/**
 * The persistent strip: one compact line per active job (dot, title, then
 * the bar flush right), visible from any screen, anchored at the configured
 * `position`. Renders nothing when the queue is empty so it never takes up
 * space with nothing to show.
 */
export function QueuePanel({ position }: { readonly position: QueuePanelPosition }) {
  const { t } = useTranslation();
  const jobs = useQueueStore((state) => state.snapshot.jobs);
  const activeJobs = jobs.filter((job) => isJobActive(job.state));
  const { width: terminalWidth } = useTerminalDimensions();

  if (activeJobs.length === 0) return null;

  const isSideways = position === "left" || position === "right";
  // Border (2) + padding (2); the ProgressBar renders bar + " NN%".
  const innerWidth = isSideways ? SIDEWAYS_WIDTH - 4 : terminalWidth - 4;
  const titleWidth = Math.max(8, innerWidth - 2 - 1 - (BAR_WIDTH + 5));

  return (
    <box
      border
      title={t("queuePanel.title", { count: activeJobs.length })}
      titleColor={palette.accent}
      style={{
        borderStyle: "rounded",
        borderColor: palette.border,
        backgroundColor: palette.surface,
        flexDirection: "column",
        padding: 1,
        ...(isSideways ? { width: SIDEWAYS_WIDTH } : { height: activeJobs.length + 4 }),
      }}
    >
      {activeJobs.map((job) => (
        <box key={job.id} style={{ flexDirection: "row", height: 1, alignItems: "center", gap: 1 }}>
          <text>
            <span fg={jobStatusColor(job.state)}>{STATUS_DOT}</span>
          </text>
          <box style={{ flexGrow: 1 }}>
            <text fg={palette.text}>{truncateText(job.video.title, titleWidth)}</text>
          </box>
          <ProgressBar ratio={jobProgressRatio(job.state)} width={BAR_WIDTH} />
        </box>
      ))}
    </box>
  );
}
