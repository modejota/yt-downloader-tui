import { useKeyboard } from "@opentui/react";
import { useTranslation } from "react-i18next";

import type { DownloadJobState } from "@/domain/queue";
import { palette, selectStyle } from "@/ui/theme";
import { isJobActive, isJobCancelable, jobStatusLabel } from "@/ui/job-progress";
import { useQueueStore } from "@/ui/queue-store";
import { Screen } from "@/ui/components/chrome";
import { useServices } from "@/ui/services-context";

const MAX_VISIBLE_JOBS = 8;
const LIST_HEIGHT_CAP = 17;

function countBy(
  jobs: readonly { readonly state: DownloadJobState }[],
  predicate: (state: DownloadJobState) => boolean,
): number {
  return jobs.filter((job) => predicate(job.state)).length;
}

export function QueueDetailScreen({ onClose }: { readonly onClose: () => void }) {
  const { t } = useTranslation();
  const { downloadQueue } = useServices();
  const jobs = useQueueStore((state) => state.snapshot.jobs);

  useKeyboard((key) => {
    if (key.name === "escape") onClose();
  });

  const activeCount = countBy(jobs, isJobActive);
  const pendingCount = countBy(jobs, (state) => state.status === "pending");
  const completedCount = countBy(jobs, (state) => state.status === "completed");
  const failedCount = countBy(jobs, (state) => state.status === "error");
  const summary = [
    activeCount > 0 ? t("queueDetail.active", { count: activeCount }) : undefined,
    pendingCount > 0 ? t("queueDetail.pending", { count: pendingCount }) : undefined,
    completedCount > 0 ? t("queueDetail.completed", { count: completedCount }) : undefined,
    failedCount > 0 ? t("queueDetail.failed", { count: failedCount }) : undefined,
  ].filter((part): part is string => part !== undefined);

  const visibleJobs = jobs.slice(0, MAX_VISIBLE_JOBS);
  const hiddenCount = jobs.length - visibleJobs.length;

  return (
    <Screen
      title={t("queueDetail.title")}
      subtitle={summary.length > 0 ? summary.join("  ·  ") : undefined}
      hints={[
        { keys: "↑↓", label: t("hints.move") },
        { keys: "Enter", label: t("hints.cancelJob") },
        { keys: "Esc", label: t("hints.close") },
      ]}
    >
      {visibleJobs.length === 0 ? (
        <text fg={palette.dim}>{t("queueDetail.empty")}</text>
      ) : (
        <select
          focused
          width="100%"
          height={Math.min(visibleJobs.length * 2 + 1, LIST_HEIGHT_CAP)}
          options={visibleJobs.map((job) => ({
            name: isJobCancelable(job.state) ? job.video.title : `✓ ${job.video.title}`,
            description: jobStatusLabel(job.state),
          }))}
          // react-doctor-disable-next-line react-doctor/no-unknown-property -- real OpenTUI `Select` prop (@opentui/core/renderables/Select.d.ts), not an unrecognized DOM attribute
          showScrollIndicator
          {...selectStyle}
          onSelect={(index) => {
            const job = visibleJobs[index];
            if (job !== undefined && isJobCancelable(job.state)) downloadQueue.cancel(job.id);
          }}
        />
      )}
      {hiddenCount > 0 ? (
        <text fg={palette.dimmer}>{t("queueDetail.moreHidden", { count: hiddenCount })}</text>
      ) : undefined}
    </Screen>
  );
}
