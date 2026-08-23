import { createContext, useContext } from "react";

import type { Defaults } from "@/domain/config";
import type { ExtractionService, MediaPipeline } from "@/domain/ports";
import type { DownloadQueue } from "@/download-queue/queue";

export type Services = {
  readonly extraction: ExtractionService;
  readonly mediaPipeline: MediaPipeline;
  readonly downloadQueue: DownloadQueue;
  readonly defaults: Defaults;
  /** Reflects a saved settings change into every screen without an app restart. */
  readonly updateDefaults: (defaults: Defaults) => void;
};

const ServicesContext = createContext<Services | undefined>(undefined);

export function ServicesProvider({
  services,
  children,
}: {
  readonly services: Services;
  readonly children: React.ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

/** Every screen mounts under ServicesProvider once the app has finished loading — see app.tsx. */
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (services === undefined) {
    throw new Error("useServices() called outside <ServicesProvider>.");
  }
  return services;
}
