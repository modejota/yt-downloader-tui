import { Component, type ReactNode } from "react";
import { useKeyboard } from "@opentui/react";
import { useTranslation } from "react-i18next";

import { palette } from "@/ui/theme";
import { useScreenHints } from "@/ui/components/chrome";

type Props = { readonly children: ReactNode };
type State = { readonly failed: boolean };

/**
 * Preventive last line of defence for bugs that escape a screen: instead of an unmounted (blank)
 * UI, show a friendly message and let the user start over from the home screen. Queued downloads
 * live outside React, so they keep running.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) {
      return <CrashNotice onRestart={() => this.setState({ failed: false })} />;
    }
    return this.props.children;
  }
}

function CrashNotice({ onRestart }: { readonly onRestart: () => void }) {
  const { t } = useTranslation();
  useScreenHints([{ keys: "Enter", label: t("hints.restart") }]);
  useKeyboard((key) => {
    if (key.name === "return") onRestart();
  });

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 1,
      }}
    >
      <text>
        <span fg={palette.red}>✕ </span>
        <span fg={palette.text}>{t("app.unexpectedError")}</span>
      </text>
      <text fg={palette.dimmer}>{t("app.unexpectedErrorHint")}</text>
    </box>
  );
}
