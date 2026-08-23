import type { Video } from "@/domain/media";
import { i18n } from "@/i18n/index";

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function formatCount(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${count}`;
}

export function formatVideoSummary(video: Video): string {
  const parts = [
    video.channelName,
    formatDuration(video.durationSeconds),
    i18n.t("videoSummary.views", { count: formatCount(video.viewCount) }),
  ];
  if (video.likeCount !== undefined) {
    parts.push(i18n.t("videoSummary.likes", { count: formatCount(video.likeCount) }));
  }
  return parts.join(" · ");
}

/** Playlist entries only carry title/channel/duration, no view/like counts. */
export function formatPlaylistItemSummary(video: Video): string {
  return `${video.channelName} · ${formatDuration(video.durationSeconds)}`;
}
