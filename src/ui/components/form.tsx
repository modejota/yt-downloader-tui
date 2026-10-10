import { useState, type ReactNode } from "react";
import { useKeyboard } from "@opentui/react";

import { palette, inputStyle } from "@/ui/theme";
import { onSubmitString } from "@/ui/opentui-input-fix";

/** One option of a choice row; it knows whether it is the current value and how to become it. */
export type Choice = {
  readonly label: string;
  readonly selected: boolean;
  readonly select: () => void;
};

/** Lists `values` as choices, marking `current` and reporting the picked value to `select`. */
export function choicesOf<Value>(
  values: readonly Value[],
  current: Value,
  describe: (value: Value) => string,
  select: (value: Value) => void,
): Choice[] {
  return values.map((value) => ({
    label: describe(value),
    selected: value === current,
    select: () => select(value),
  }));
}

type ChoiceRow = {
  readonly kind: "choice";
  readonly id: string;
  readonly label: string;
  readonly choices: readonly Choice[];
};

type InputRow = {
  readonly kind: "input";
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly onSubmit: (value: string) => void;
};

type ActionRow = {
  readonly kind: "action";
  readonly id: string;
  readonly label: string;
  readonly onTrigger: () => void;
  readonly tone?: "primary" | "normal";
};

type InfoRow = {
  readonly kind: "info";
  readonly text: string;
  readonly tone: "dim" | "error";
};

type HeadingRow = { readonly kind: "heading"; readonly label: string };

export type FormRow = ChoiceRow | InputRow | ActionRow | InfoRow | HeadingRow;

type InteractiveRow = ChoiceRow | InputRow | ActionRow;

const LABEL_COLUMN_WIDTH = 16;

function isInteractive(row: FormRow): row is InteractiveRow {
  return row.kind === "choice" || row.kind === "input" || row.kind === "action";
}

export function Form({ rows }: { readonly rows: readonly FormRow[] }) {
  const interactiveRows = rows.filter(isInteractive);
  const [activeId, setActiveId] = useState(interactiveRows[0]?.id);
  // Rows come and go (e.g. trim inputs); a vanished active row hands focus back to the first one.
  const active = interactiveRows.find((row) => row.id === activeId) ?? interactiveRows[0];

  function move(direction: 1 | -1): void {
    if (active === undefined) return;
    const index = interactiveRows.indexOf(active);
    setActiveId(interactiveRows.at((index + direction) % interactiveRows.length)?.id);
  }

  useKeyboard((key) => {
    if (key.ctrl || active === undefined) return;

    if (key.name === "up" || (key.name === "tab" && key.shift)) {
      move(-1);
      return;
    }
    if (key.name === "down" || key.name === "tab") {
      move(1);
      return;
    }
    if (key.name === "home") {
      setActiveId(interactiveRows[0]?.id);
      return;
    }
    if (key.name === "end") {
      setActiveId(interactiveRows.at(-1)?.id);
      return;
    }

    if (active.kind === "choice" && (key.name === "left" || key.name === "right")) {
      const index = active.choices.findIndex((choice) => choice.selected);
      const step = key.name === "left" ? -1 : 1;
      active.choices.at((index + step) % active.choices.length)?.select();
      return;
    }

    if (key.name === "return") {
      // Input rows: the focused <input> commits through its own onSubmit.
      if (active.kind === "action") active.onTrigger();
      else if (active.kind === "choice") move(1);
    }
  });

  return (
    <box style={{ flexDirection: "column" }}>
      {rows.map((row, index) => renderRow(row, index, active?.id, move))}
    </box>
  );
}

function renderRow(
  row: FormRow,
  index: number,
  activeId: string | undefined,
  move: (direction: 1 | -1) => void,
): ReactNode {
  if (row.kind === "heading") {
    return (
      <text key={index}>
        <span fg={palette.borderStrong}>── </span>
        <span fg={palette.dim}>{row.label.toUpperCase()}</span>
      </text>
    );
  }

  if (row.kind === "info") {
    return (
      <text key={index} fg={row.tone === "error" ? palette.red : palette.dimmer}>
        {row.text}
      </text>
    );
  }

  const focused = row.id === activeId;

  if (row.kind === "choice") {
    return (
      <FieldRow key={row.id} focused={focused} label={row.label}>
        <box style={{ flexDirection: "row", flexGrow: 1, gap: 2, alignItems: "center" }}>
          {row.choices.map((choice) => (
            <text key={choice.label}>
              <span fg={choice.selected ? palette.gold : palette.dimmer}>
                {choice.selected ? "◉" : "○"}{" "}
              </span>
              <span fg={choice.selected ? palette.text : palette.dim}>{choice.label}</span>
            </text>
          ))}
        </box>
      </FieldRow>
    );
  }

  if (row.kind === "input") {
    return (
      <FieldRow key={row.id} focused={focused} label={row.label}>
        {focused ? (
          <input
            focused
            width="60%"
            value={row.value}
            placeholder={row.placeholder}
            onSubmit={onSubmitString((value) => {
              row.onSubmit(value);
              move(1);
            })}
            {...inputStyle}
          />
        ) : (
          <text fg={row.value.length > 0 ? palette.dim : palette.dimmer}>
            {row.value.length > 0 ? row.value : row.placeholder}
          </text>
        )}
      </FieldRow>
    );
  }

  const primary = row.tone !== "normal";
  return (
    // The CTA lives in the value column: no duplicate label, no 16-char cap.
    <FieldRow key={row.id} focused={focused} label="">
      <text>
        <span fg={primary ? palette.gold : focused ? palette.accentBright : palette.dim}>
          ▶ {row.label}
        </span>
      </text>
    </FieldRow>
  );
}

/** The focus marker and label column every interactive row shares. */
function FieldRow({
  focused,
  label,
  children,
}: {
  readonly focused: boolean;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <box
      style={{
        flexDirection: "row",
        height: 1,
        alignItems: "center",
        paddingLeft: 1,
        backgroundColor: focused ? palette.surfaceRaised : "transparent",
      }}
    >
      <box style={{ width: 2 }}>
        <text fg={focused ? palette.accent : "transparent"}>❯ </text>
      </box>
      <box style={{ width: LABEL_COLUMN_WIDTH }}>
        <text fg={focused ? palette.accentBright : palette.dim}>{label}</text>
      </box>
      {children}
    </box>
  );
}
