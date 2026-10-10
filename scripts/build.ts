/**
 * Compiles the app into a single self-contained executable per target:
 *
 *   bun scripts/build.ts                     # current platform
 *   bun scripts/build.ts linux-x64 darwin-arm64
 *   bun scripts/build.ts all
 *
 * node-av picks its FFmpeg addon at runtime from a package name built out of
 * process.platform/arch, which the bundler cannot follow, so the addon would be
 * left out of the executable. The plugin below swaps node-av's loader for a
 * static `require()` of the target's addon, which `bun build --compile` embeds.
 * Cross-compiling needs every target's packages: `bun install --os="*" --cpu="*"`.
 */
import path from "node:path";

import type { BunPlugin } from "bun";

const ROOT = path.resolve(import.meta.dir, "..");

const TARGETS = [
  { name: "windows-x64", addonPackage: "@seydx/node-av-win32-x64-msvc" },
  { name: "linux-x64", addonPackage: "@seydx/node-av-linux-x64" },
  { name: "linux-arm64", addonPackage: "@seydx/node-av-linux-arm64" },
  { name: "darwin-x64", addonPackage: "@seydx/node-av-darwin-x64" },
  { name: "darwin-arm64", addonPackage: "@seydx/node-av-darwin-arm64" },
] as const;

type Target = (typeof TARGETS)[number];

function parseTarget(name: string): Target {
  const target = TARGETS.find((candidate) => candidate.name === name);
  if (target === undefined) {
    const names = TARGETS.map((candidate) => candidate.name).join(", ");
    throw new Error(`Unknown target "${name}". Use one of: ${names}, all`);
  }
  return target;
}

function embedNodeAvAddon(target: Target): BunPlugin {
  const addonPath = Bun.resolveSync(`${target.addonPackage}/node-av.node`, ROOT);
  return {
    name: "embed-node-av-addon",
    setup(build) {
      build.onLoad({ filter: /[\\/]node-av[\\/]dist[\\/]lib[\\/]binding\.js$/u }, () => ({
        contents: `export const bindings = require(${JSON.stringify(addonPath)});`,
        loader: "js",
      }));
    },
  };
}

async function buildTarget(target: Target): Promise<void> {
  const extension = target.name.startsWith("windows") ? ".exe" : "";
  const outfile = path.join(ROOT, "dist", `yt-downloader-tui-${target.name}${extension}`);
  await Bun.build({
    entrypoints: [path.join(ROOT, "src", "index.tsx")],
    compile: { target: `bun-${target.name}`, outfile },
    plugins: [embedNodeAvAddon(target)],
  });
  console.log(`Built ${path.relative(ROOT, outfile)}`);
}

const hostTarget = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const requested = process.argv.slice(2);
const targets = requested.includes("all")
  ? TARGETS
  : (requested.length === 0 ? [hostTarget] : requested).map(parseTarget);

for (const target of targets) {
  await buildTarget(target);
}
