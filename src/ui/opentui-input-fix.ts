import type { InputProps } from "@opentui/react";

/**
 * OpenTUI types `<input onSubmit>` as the intersection of Textarea's `(event: SubmitEvent) => void`
 * and Input's `(value: string) => void`, which no handler can satisfy.
 */
export function onSubmitString(handler: (value: string) => void): InputProps["onSubmit"] {
  // SAFETY: @opentui/react 0.5.4 wires `onSubmit` on <input> to InputRenderable's "enter" event,
  // which always emits the current string value — the SubmitEvent half is Textarea-only.
  return handler as InputProps["onSubmit"];
}
