import { describe, expect, it } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act, useState } from "react";

import { Form, type FormRow } from "@/ui/components/form";

function Harness() {
  const [value, setValue] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const rows: readonly FormRow[] = [
    { kind: "heading", label: "Section" },
    {
      kind: "choice",
      id: "one",
      label: "One",
      choices: ["A", "B", "C"],
      selectedIndex: value,
      onChange: setValue,
    },
    {
      kind: "action",
      id: "go",
      label: "Go",
      onTrigger: () => setSubmitted(true),
    },
  ];

  return (
    <>
      <Form rows={rows} />
      <text>{`choice=${value} submitted=${submitted}`}</text>
    </>
  );
}

function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

/**
 * `waitForFrame()` pumps the renderer's own scheduler, not React's — key
 * presses update state on a later tick of the renderer's own event loop, not
 * synchronously. Wrapping the press + a real tick in `act()` lets React
 * batch and flush that update instead of warning about it.
 */
function interact(fireInput: () => void): Promise<void> {
  return act(async () => {
    fireInput();
    await flushAsyncWork();
  });
}

describe("Form", () => {
  it("changes the focused choice with ←/→ and wraps around", async () => {
    const setup = await testRender(<Harness />, { width: 60, height: 12 });

    try {
      await setup.renderOnce();
      let frame = await setup.waitForFrame((text) => text.includes("choice=0"));
      expect(frame).toContain("◉ A");

      await interact(() => setup.mockInput.pressArrow("right"));
      frame = await setup.waitForFrame((text) => text.includes("choice=1"));
      expect(frame).toContain("◉ B");

      await interact(() => setup.mockInput.pressArrow("right"));
      await interact(() => setup.mockInput.pressArrow("right")); // past C wraps back to A
      frame = await setup.waitForFrame((text) => text.includes("choice=0"));
      expect(frame).toContain("◉ A");

      await interact(() => setup.mockInput.pressArrow("left")); // before A wraps to C
      frame = await setup.waitForFrame((text) => text.includes("choice=2"));
      expect(frame).toContain("◉ C");
    } finally {
      setup.renderer.destroy();
    }
  });

  it("moves between rows with ↑/↓ and triggers actions with Enter", async () => {
    const setup = await testRender(<Harness />, { width: 60, height: 12 });

    try {
      await setup.renderOnce();
      await setup.waitForFrame((text) => text.includes("choice=0"));

      await interact(() => setup.mockInput.pressArrow("down"));
      await interact(() => setup.mockInput.pressEnter());

      const frame = await setup.waitForFrame((text) => text.includes("submitted=true"));
      expect(frame).toContain("submitted=true");
    } finally {
      setup.renderer.destroy();
    }
  });

  it("shows every choice of every row at once", async () => {
    const setup = await testRender(<Harness />, { width: 60, height: 12 });

    try {
      await setup.renderOnce();
      const frame = await setup.waitForFrame((text) => text.includes("choice=0"));
      expect(frame).toContain("A");
      expect(frame).toContain("B");
      expect(frame).toContain("C");
      expect(frame).toContain("Go");
    } finally {
      setup.renderer.destroy();
    }
  });
});
