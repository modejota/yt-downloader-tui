import type { DownloadJobState } from "@/domain/queue";
import { i18n } from "@/i18n/index";
import { palette } from "@/ui/theme";

/** The label shown for a job's current state. */
export function jobStatusLabel(state: DownloadJobState): string {
  if (state.status === "pending") return i18n.t("jobStatus.pending");
  if (state.status === "resolving-formats") return i18n.t("jobStatus.resolvingFormats");
  if (state.status === "downloading") return i18n.t("jobStatus.downloading");
  if (state.status === "converting") {
    return state.mode === "remux" ? i18n.t("jobStatus.packaging") : i18n.t("jobStatus.converting");
  }
  if (state.status === "tagging") return i18n.t("jobStatus.tagging");
  if (state.status === "completed") return i18n.t("jobStatus.completed");
  if (state.status === "cancelled") return i18n.t("jobStatus.cancelled");
  return i18n.t("jobStatus.error", { message: state.message });
}

export function jobProgressRatio(state: DownloadJobState): number {
  if (state.status === "downloading") {
    const total = state.bytesTotal;
    return total === undefined || total === 0 ? 0 : state.bytesReceived / total;
  }
  if (state.status === "converting") return state.ratio;
  if (state.status === "completed") return 1;
  return 0;
}

/** A job still occupying a worker slot — what the persistent panel shows. */
export function isJobActive(state: DownloadJobState): boolean {
  return (
    state.status === "resolving-formats" ||
    state.status === "downloading" ||
    state.status === "converting" ||
    state.status === "tagging"
  );
}

/** A job that can still be cancelled — any state but `completed`. */
export function isJobCancelable(state: DownloadJobState): boolean {
  return state.status !== "completed" && state.status !== "cancelled";
}

/** The LED color for a job's current stage, shared by panel and detail rows. */
export function jobStatusColor(state: DownloadJobState): string {
  if (state.status === "downloading") return palette.gold;
  if (
    state.status === "resolving-formats" ||
    state.status === "converting" ||
    state.status === "tagging"
  ) {
    return palette.cyan;
  }
  if (state.status === "completed") return palette.green;
  if (state.status === "error") return palette.red;
  return palette.dim;
}
