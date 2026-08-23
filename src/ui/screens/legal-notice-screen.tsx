import { useKeyboard } from "@opentui/react";
import { useTranslation } from "react-i18next";

import { palette } from "@/ui/theme";
import { useScreenHints } from "@/ui/components/chrome";

export function LegalNoticeScreen({ onContinue }: { readonly onContinue: () => void }) {
  const { t } = useTranslation();
  useKeyboard((key) => {
    if (key.name === "return" || key.name === "escape") onContinue();
  });

  useScreenHints([{ keys: "Enter", label: t("hints.confirm") }]);

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 2,
      }}
    >
      <box
        border
        style={{
          borderStyle: "rounded",
          borderColor: palette.borderStrong,
          backgroundColor: palette.surface,
          flexDirection: "column",
          width: "80%",
          padding: 1,
          gap: 1,
        }}
      >
        <text>
          <span fg={palette.accent}>▶ </span>
          <span fg={palette.text}>{t("app.title")}</span>
        </text>
        <text fg={palette.dim}>{t("legalNotice.body")}</text>
        <text fg={palette.dimmer}>{t("legalNotice.settingsHint")}</text>
        <text fg={palette.gold}>{t("legalNotice.continueHint")}</text>
      </box>
    </box>
  );
}
