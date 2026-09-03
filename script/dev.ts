#!/usr/bin/env node
/**
 * `npm run dev` — build once from the committed snapshot, then serve.
 *
 * There is no Vite dev server: the HTML is produced by script/prerender.ts, not
 * by a Vite template, so a dev server would serve pages that do not exist. A
 * full build from the committed snapshot takes a few seconds when the image
 * cache is warm, which is fast enough to iterate against.
 *
 * Pass --skip-images to leave cart photography untouched (much faster).
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skipImages = process.argv.includes("--skip-images");

function run(command: string, args: string[]): void {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    process.stderr.write(`\nStep failed: ${command} ${args.join(" ")}\n`);
    process.exit(result.status ?? 1);
  }
}

run("node", ["script/generate-seo.ts"]);
run("node", ["script/optimize-assets.ts", ...(skipImages ? ["--skip-carts"] : [])]);
run("npx", ["vite", "build"]);
run("node", ["script/prerender.ts"]);
run("node", ["script/serve.ts"]);
