import type { InputProps } from "@opentui/react";

export function onSubmitString(handler: (value: string) => void): InputProps["onSubmit"] {
  return handler as InputProps["onSubmit"];
}
