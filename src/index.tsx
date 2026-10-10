import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

import { App } from "@/ui/app";

// Screens report DomainErrors themselves; OpenTUI's console overlay would show users stack traces.
const renderer = await createCliRenderer({ exitOnCtrlC: true, openConsoleOnError: false });
createRoot(renderer).render(<App />);
