const originalConsoleError = console.error;

/**
 * `@opentui/react`'s `testRender()` wraps mount/unmount in `act()`, but its
 * own internal "Root" wrapper defers part of its unmount cleanup by a real
 * tick — landing after `renderer.destroy()` (and that `act()` scope) has
 * already returned, outside anything a test can wrap. Confirmed reproducible
 * with a single-`useState` component, zero interaction, and no app code
 * involved (@opentui/react 0.5.4 and 0.5.6 both do this), so it's a test
 * harness limitation, not a real violation. Genuine act() violations name an
 * actual component (e.g. "HomeScreen"), never "Root", so this stays narrow.
 */
console.error = (...args: unknown[]) => {
  const [message, subject] = args;
  const isKnownRootActWarning =
    typeof message === "string" &&
    message.includes("An update to %s inside a test was not wrapped in act(...)") &&
    subject === "Root";
  if (isKnownRootActWarning) return;
  originalConsoleError(...args);
};
