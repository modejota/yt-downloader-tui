import { useState, type ReactNode } from "react";
import { useKeyboard } from "@opentui/react";

import { palette, inputStyle } from "@/ui/theme";
import { onSubmitString } from "@/ui/opentui-input-fix";

export type ChoiceRow = {
  readonly kind: "choice";
  readonly id: string;
  readonly label: string;
  readonly choices: readonly string[];
  readonly selectedIndex: number;
  readonly onChange: (index: number) => void;
};

export type InputRow = {
  readonly kind: "input";
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly onSubmit?: (value: string) => void;
};

export type ActionRow = {
  readonly kind: "action";
  readonly id: string;
  readonly label: string;
  readonly onTrigger: () => void;
  readonly tone?: "primary" | "normal";
};

type InfoRow = {
  readonly kind: "info";
  readonly text: string;
  readonly tone?: "dim" | "error" | "gold";
};

type HeadingRow = { readonly kind: "heading"; readonly label: string };

export type FormRow = ChoiceRow | InputRow | ActionRow | InfoRow | HeadingRow;

const LABEL_COLUMN_WIDTH = 16;

function isInteractive(row: FormRow): row is ChoiceRow | InputRow | ActionRow {
  return row.kind === "choice" || row.kind === "input" || row.kind === "action";
}

export function Form({ rows }: { readonly rows: readonly FormRow[] }) {
  const interactiveIds: string[] = [];
  for (const row of rows) {
    if (isInteractive(row)) interactiveIds.push(row.id);
  }
  const [activeId, setActiveId] = useState<string | undefined>(interactiveIds[0]);
  const current =
    activeId !== undefined && interactiveIds.includes(activeId) ? activeId : interactiveIds[0];

  function move(direction: 1 | -1): void {
    if (interactiveIds.length === 0) return;
    const index = current === undefined ? 0 : interactiveIds.indexOf(current);
    const next = (index + direction + interactiveIds.length) % interactiveIds.length;
    setActiveId(interactiveIds[next] ?? current);
  }

  useKeyboard((key) => {
    if (key.ctrl) return;
    const row = rows.find((candidate) => isInteractive(candidate) && candidate.id === current);
    if (row === undefined) return;

    if (key.name === "up" || (key.name === "tab" && key.shift)) {
      move(-1);
      return;
    }
    if (key.name === "down" || key.name === "tab") {
      move(1);
      return;
    }
    if (key.name === "home" && interactiveIds[0] !== undefined) {
      setActiveId(interactiveIds[0]);
      return;
    }
    if (key.name === "end") {
      const last = interactiveIds.at(-1);
      if (last !== undefined) setActiveId(last);
      return;
    }

    if (row.kind === "choice" && row.choices.length > 0) {
      if (key.name === "left") {
        row.onChange((row.selectedIndex - 1 + row.choices.length) % row.choices.length);
        return;
      }
      if (key.name === "right") {
        row.onChange((row.selectedIndex + 1) % row.choices.length);
        return;
      }
    }

    if (key.name === "return") {
      // Input rows: the focused <input> commits through its own onSubmit.
      if (row.kind === "action") row.onTrigger();
      else if (row.kind === "choice") move(1);
    }
  });

  return (
    <box style={{ flexDirection: "column" }}>
      {rows.map((row, index) => renderRow(row, index, current, move))}
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
    const tone =
      row.tone === "error" ? palette.red : row.tone === "gold" ? palette.gold : palette.dimmer;
    return (
      <text key={index} fg={tone}>
        {row.text}
      </text>
    );
  }

  const focused = row.id === activeId;
  const marker = (
    <box style={{ width: 2 }}>
      <text fg={focused ? palette.accent : "transparent"}>❯ </text>
    </box>
  );
  const labelBox = (
    <box style={{ width: LABEL_COLUMN_WIDTH }}>
      <text fg={focused ? palette.accentBright : palette.dim}>{row.label}</text>
    </box>
  );

  if (row.kind === "choice") {
    return (
      <box
        key={row.id}
        style={{
          flexDirection: "row",
          height: 1,
          alignItems: "center",
          paddingLeft: 1,
          backgroundColor: focused ? palette.surfaceRaised : "transparent",
        }}
      >
        {marker}
        {labelBox}
        <box style={{ flexDirection: "row", flexGrow: 1, gap: 2, alignItems: "center" }}>
          {row.choices.map((choice, choiceIndex) => {
            const selected = choiceIndex === row.selectedIndex;
            return (
              <text key={choice}>
                <span fg={selected ? palette.gold : palette.dimmer}>{selected ? "◉" : "○"} </span>
                <span fg={selected ? palette.text : palette.dim}>{choice}</span>
              </text>
            );
          })}
        </box>
      </box>
    );
  }

  if (row.kind === "input") {
    return (
      <box
        key={row.id}
        style={{
          flexDirection: "row",
          height: 1,
          alignItems: "center",
          paddingLeft: 1,
          backgroundColor: focused ? palette.surfaceRaised : "transparent",
        }}
      >
        {marker}
        {labelBox}
        {focused ? (
          <input
            focused
            width="60%"
            value={row.value}
            placeholder={row.placeholder ?? ""}
            onSubmit={onSubmitString((value) => {
              row.onSubmit?.(value);
              move(1);
            })}
            {...inputStyle}
          />
        ) : (
          <text fg={row.value.length > 0 ? palette.dim : palette.dimmer}>
            {row.value.length > 0 ? row.value : (row.placeholder ?? "")}
          </text>
        )}
      </box>
    );
  }

  const primary = row.tone !== "normal";
  return (
    <box
      key={row.id}
      style={{
        flexDirection: "row",
        height: 1,
        alignItems: "center",
        paddingLeft: 1,
        backgroundColor: focused ? palette.surfaceRaised : "transparent",
      }}
    >
      {marker}
      {/* The CTA lives in the value column: no duplicate label, no 16-char cap. */}
      <box style={{ width: LABEL_COLUMN_WIDTH }} />
      <text>
        <span
          fg={
            focused
              ? primary
                ? palette.gold
                : palette.accentBright
              : primary
                ? palette.gold
                : palette.dim
          }
        >
          ▶ {row.label}
        </span>
      </text>
    </box>
  );
}
