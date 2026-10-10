import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { palette } from "@/ui/theme";
import { isJobActive } from "@/ui/job-progress";
import { useQueueStore } from "@/ui/queue-store";

export type KeyHint = {
  readonly keys: string;
  readonly label: string;
};

type RegisterHints = (hints: readonly KeyHint[]) => void;

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const HintContext = createContext<RegisterHints | undefined>(undefined);

export function AppFrame({ children }: { readonly children: ReactNode }) {
  const [hints, setHints] = useState<readonly KeyHint[] | undefined>(undefined);

  return (
    <HintContext.Provider value={setHints}>
      <box style={{ flexDirection: "column", flexGrow: 1, backgroundColor: palette.bg }}>
        <BrandBand />
        <box style={{ flexDirection: "column", flexGrow: 1 }}>{children}</box>
        <StatusBar hints={hints} />
      </box>
    </HintContext.Provider>
  );
}

function BrandBand() {
  const { t } = useTranslation();
  const activeCount = useQueueStore(
    (state) => state.snapshot.jobs.filter((job) => isJobActive(job.state)).length,
  );

  return (
    <box
      style={{
        flexDirection: "row",
        height: 1,
        backgroundColor: palette.chrome,
        paddingLeft: 1,
        paddingRight: 1,
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <text>
        <span fg={palette.accent}>▶ </span>
        <span fg={palette.text}>{t("app.title")}</span>
      </text>
      <text>
        {activeCount > 0 ? (
          <span fg={palette.gold}>
            {t("header.activeDownloads", { count: activeCount })}
            {"   "}
          </span>
        ) : undefined}
        <span fg={palette.dimmer}>{t("header.globalKeys")}</span>
      </text>
    </box>
  );
}

function StatusBar({ hints }: { readonly hints: readonly KeyHint[] | undefined }) {
  const { t } = useTranslation();
  const shown =
    hints ??
    ([
      { keys: "↑↓", label: t("hints.move") },
      { keys: "←→", label: t("hints.change") },
      { keys: "Enter", label: t("hints.confirm") },
      { keys: "Esc", label: t("hints.back") },
    ] as const satisfies readonly KeyHint[]);

  return (
    <box
      style={{
        flexDirection: "row",
        height: 1,
        backgroundColor: palette.chrome,
        paddingLeft: 1,
        paddingRight: 1,
        gap: 3,
        alignItems: "center",
      }}
    >
      {shown.map((hint) => (
        <text key={`${hint.keys}:${hint.label}`}>
          <span fg={palette.dimmer}>[</span>
          <span fg={palette.accentBright}>{hint.keys}</span>
          <span fg={palette.dimmer}>]</span>
          <span fg={palette.dim}> {hint.label}</span>
        </text>
      ))}
    </box>
  );
}

/** Claims the status bar for as long as the calling screen is mounted. */
export function useScreenHints(hints: readonly KeyHint[]): void {
  const registerHints = useContext(HintContext);
  if (registerHints === undefined) {
    throw new Error("useScreenHints() called outside <AppFrame>.");
  }
  // `hints` is a fresh array every render; its serialized content is the stable effect key.
  const serialized = JSON.stringify(hints);
  useEffect(() => {
    registerHints(hints);
    return () => registerHints([]);
  }, [serialized, registerHints]);
}

export function Screen({
  title,
  subtitle,
  hints,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly hints: readonly KeyHint[];
  readonly children: ReactNode;
}) {
  useScreenHints(hints);

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, padding: 1, gap: 1 }}>
      <box style={{ flexDirection: "row", gap: 1, alignItems: "center" }}>
        <text fg={palette.accent}>▍</text>
        <text>
          <span fg={palette.text}>{title}</span>
          {subtitle !== undefined ? <span fg={palette.dimmer}> — {subtitle}</span> : undefined}
        </text>
      </box>
      <box style={{ flexDirection: "column", flexGrow: 1, gap: 1 }}>{children}</box>
    </box>
  );
}

export function Card({
  title,
  children,
}: {
  readonly title?: string;
  readonly children: ReactNode;
}) {
  return (
    <box
      border
      title={title}
      titleColor={palette.accent}
      style={{
        borderStyle: "rounded",
        borderColor: palette.border,
        backgroundColor: palette.surface,
        flexDirection: "column",
        padding: 1,
        gap: 1,
      }}
    >
      {children}
    </box>
  );
}

export function Spinner({ label }: { readonly label: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame((current) => current + 1), 120);
    return () => clearInterval(timer);
  }, []);

  return (
    <text>
      <span fg={palette.gold}>{SPINNER_FRAMES[frame % SPINNER_FRAMES.length]}</span>
      <span fg={palette.dim}> {label}</span>
    </text>
  );
}

/** A failure the user can act on, shown in place — never a stack trace. */
export function ErrorLine({ message }: { readonly message: string }) {
  return (
    <text>
      <span fg={palette.red}>✕ </span>
      <span fg={palette.red}>{message}</span>
    </text>
  );
}
