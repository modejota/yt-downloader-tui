export const palette = {
  // Canvas & surfaces
  bg: "#0b0f16", // app canvas behind everything
  surface: "#121826", // cards
  surfaceRaised: "#1a2334", // focused rows, inputs, chips
  chrome: "#101623", // header / status bar band

  // Structure
  border: "#27324a", // regular panel border
  borderStrong: "#3b4a6b", // emphasized panel border

  // Brand
  accent: "#e8604c", // terracotta coral — logo, markers, titles
  accentBright: "#ff8a70", // hover-grade accent for selected values

  // Semantics
  gold: "#f5b952", // progress, selected value, counts
  green: "#58d68d", // success, completed
  red: "#f2616f", // errors, destructive
  cyan: "#56c8e8", // in-flight stages (resolving/converting)

  // Text
  text: "#e8ecf4", // primary
  dim: "#8a94ab", // secondary
  dimmer: "#59627a", // hints, decoration
} as const;

/** A dot that reads as a status LED at one glance; color it per state. */
export const STATUS_DOT = "●";

/** Shared select styling so every list in the app looks like the same app. */
export const selectStyle = {
  textColor: palette.text,
  backgroundColor: "transparent",
  selectedBackgroundColor: palette.accent,
  selectedTextColor: "#14100e",
  descriptionColor: palette.dim,
  selectedDescriptionColor: "#3d1f19",
  focusedBackgroundColor: "transparent",
} as const;

export const inputStyle = {
  textColor: palette.text,
  backgroundColor: palette.surfaceRaised,
  focusedBackgroundColor: "#232f47",
  cursorColor: palette.accentBright,
} as const;
