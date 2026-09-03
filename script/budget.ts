#!/usr/bin/env node
/**
 * Phase 6 — the performance budget gate.
 *
 * Prints the before/after size table and the twenty largest files in dist/,
 * then fails the build on a hard violation. GitHub Pages caps any single file
 * at 100 MB and warns past roughly 1 GB of repository, so the hard limits here
 * sit below those.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative, extname } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(root, "dist");

/** Budgets. `hard` fails the build; `warn` is reported loudly. */
const BUDGET = {
  singleFileWarn: 25 * 1024 * 1024,
  singleFileHard: 100 * 1024 * 1024,
  distHard: 500 * 1024 * 1024,
  listAbove: 1 * 1024 * 1024,
  initialJsGzip: 200 * 1024,
  lcpImage: 200 * 1024,
};

interface Entry { path: string; size: number }

function walk(directory: string, out: Entry[] = []): Entry[] {
  for (const name of readdirSync(directory)) {
    const full = join(directory, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push({ path: relative(DIST, full), size: stat.size });
  }
  return out;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const human = (bytes: number) => (bytes >= 1024 * 1024 ? mb(bytes) : kb(bytes));

function main() {
  if (!existsSync(DIST)) {
    process.stderr.write("FATAL: dist/ does not exist. Run the build first.\n");
    process.exit(1);
  }

  const files = walk(DIST);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const failures: string[] = [];
  const warnings: string[] = [];

  /* --- by type ---------------------------------------------------------- */

  const byType = new Map<string, { count: number; bytes: number }>();
  for (const file of files) {
    const key = extname(file.path).toLowerCase() || "(none)";
    const entry = byType.get(key) ?? { count: 0, bytes: 0 };
    entry.count += 1;
    entry.bytes += file.size;
    byType.set(key, entry);
  }

  process.stdout.write(`\n${"=".repeat(72)}\nBUILD SIZE — dist/\n${"=".repeat(72)}\n`);
  process.stdout.write(`  ${"type".padEnd(12)}${"files".padStart(8)}${"size".padStart(14)}${"share".padStart(9)}\n`);
  for (const [type, entry] of [...byType.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
    process.stdout.write(
      `  ${type.padEnd(12)}${String(entry.count).padStart(8)}${human(entry.bytes).padStart(14)}` +
        `${((entry.bytes / total) * 100).toFixed(1).padStart(8)}%\n`,
    );
  }
  process.stdout.write(`  ${"-".repeat(42)}\n  ${"TOTAL".padEnd(12)}${String(files.length).padStart(8)}${human(total).padStart(14)}\n`);

  /* --- before / after --------------------------------------------------- */

  const manifestPath = resolve(root, "src/data/image-manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const entries = Object.values(manifest.carts ?? {}) as Array<{ origBytes?: number }>;
    const originals = entries.reduce((sum, entry) => sum + (entry.origBytes ?? 0), 0);
    const derivatives = files
      .filter((file) => file.path.startsWith("images/carts"))
      .reduce((sum, file) => sum + file.size, 0);
    const known = entries.filter((entry) => entry.origBytes).length;

    process.stdout.write(`\n${"=".repeat(72)}\nBEFORE / AFTER — cart photography\n${"=".repeat(72)}\n`);
    if (originals > 0) {
      process.stdout.write(
        `  source photographs (${known})       ${human(originals).padStart(12)}\n` +
          `  optimized derivatives             ${human(derivatives).padStart(12)}\n` +
          `  change                            ${(derivatives < originals ? "-" : "+")}${Math.abs(100 - (derivatives / originals) * 100).toFixed(1).padStart(11)}%\n` +
          `  average per source photograph     ${kb(originals / Math.max(1, known)).padStart(12)}\n` +
          `  average shipped per photograph    ${kb(derivatives / Math.max(1, entries.length)).padStart(12)}\n`,
      );
    } else {
      process.stdout.write("  no recorded source sizes (photos served from cache with no prior manifest)\n");
    }
  }

  /* --- JS budget -------------------------------------------------------- */

  process.stdout.write(`\n${"=".repeat(72)}\nJAVASCRIPT & CSS (gzipped)\n${"=".repeat(72)}\n`);
  let initialJs = 0;
  for (const file of files.filter((entry) => /\.(js|css)$/.test(entry.path)).sort((a, b) => b.size - a.size)) {
    const gzip = gzipSync(readFileSync(resolve(DIST, file.path))).length;
    if (file.path.endsWith(".js")) initialJs += gzip;
    process.stdout.write(`  ${file.path.padEnd(44)}${kb(file.size).padStart(11)} raw ${kb(gzip).padStart(11)} gz\n`);
  }
  process.stdout.write(`  ${"-".repeat(66)}\n  ${"total JS, gzipped".padEnd(44)}${kb(initialJs).padStart(26)}\n`);
  if (initialJs > BUDGET.initialJsGzip) {
    warnings.push(`JS is ${kb(initialJs)} gzipped, over the ${kb(BUDGET.initialJsGzip)} target`);
  } else {
    process.stdout.write(`  within the ${kb(BUDGET.initialJsGzip)} target\n`);
  }

  /* --- LCP image -------------------------------------------------------- */

  // The LCP candidate is the 800px primary derivative: that is what `sizes`
  // resolves to on a phone and on a standard desktop hero.
  const lcpCandidates = files.filter((file) => /images\/carts\/.*-800\.webp$/.test(file.path));
  if (lcpCandidates.length) {
    const sizes = lcpCandidates.map((file) => file.size).sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)];
    const largest = sizes[sizes.length - 1];
    const over = sizes.filter((size) => size > BUDGET.lcpImage).length;
    process.stdout.write(`\n${"=".repeat(72)}\nLCP IMAGE CANDIDATES (800px WebP, ${lcpCandidates.length} files)\n${"=".repeat(72)}\n`);
    process.stdout.write(
      `  median  ${kb(median).padStart(10)}\n  largest ${kb(largest).padStart(10)}\n` +
        `  over the ${kb(BUDGET.lcpImage)} target: ${over} of ${lcpCandidates.length}\n`,
    );
    if (over > 0) {
      warnings.push(`${over} of ${lcpCandidates.length} LCP candidates exceed ${kb(BUDGET.lcpImage)} (largest ${kb(largest)})`);
    }
  }

  /* --- largest files ---------------------------------------------------- */

  const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 20);
  process.stdout.write(`\n${"=".repeat(72)}\n20 LARGEST FILES IN dist/\n${"=".repeat(72)}\n`);
  largest.forEach((file, index) => {
    process.stdout.write(`  ${String(index + 1).padStart(2)}. ${human(file.size).padStart(10)}  ${file.path}\n`);
  });

  /* --- budget checks ---------------------------------------------------- */

  const overOneMb = files.filter((file) => file.size > BUDGET.listAbove).sort((a, b) => b.size - a.size);
  process.stdout.write(`\n${"=".repeat(72)}\nFILES OVER 1 MB\n${"=".repeat(72)}\n`);
  if (!overOneMb.length) {
    process.stdout.write("  none\n");
  } else {
    for (const file of overOneMb) {
      process.stdout.write(`  ${human(file.size).padStart(10)}  ${file.path}\n`);
    }
  }

  for (const file of files) {
    if (file.size > BUDGET.singleFileHard) {
      failures.push(`${file.path} is ${human(file.size)}, over the 100 MB GitHub Pages per-file cap`);
    } else if (file.size > BUDGET.singleFileWarn) {
      warnings.push(`${file.path} is ${human(file.size)}, over the 25 MB warning threshold`);
    }
  }
  if (total > BUDGET.distHard) {
    failures.push(`dist/ is ${human(total)}, over the 500 MB hard limit`);
  }

  /* --- verdict ---------------------------------------------------------- */

  process.stdout.write(`\n${"=".repeat(72)}\nBUDGET\n${"=".repeat(72)}\n`);
  const check = (label: string, ok: boolean, detail: string) =>
    process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(42)} ${detail}\n`);

  check("single file <= 100 MB (hard)", !files.some((f) => f.size > BUDGET.singleFileHard), `largest ${human(largest[0]?.size ?? 0)}`);
  check("single file <= 25 MB (warn)", !files.some((f) => f.size > BUDGET.singleFileWarn), `largest ${human(largest[0]?.size ?? 0)}`);
  check("dist/ <= 500 MB (hard)", total <= BUDGET.distHard, human(total));
  check("JS <= 200 KB gzipped", initialJs <= BUDGET.initialJsGzip, kb(initialJs));

  if (warnings.length) {
    process.stdout.write(`\n  ${warnings.length} warning(s):\n`);
    for (const warning of warnings) process.stdout.write(`    WARN  ${warning}\n`);
  }
  if (failures.length) {
    process.stdout.write(`\n  ${failures.length} hard failure(s):\n`);
    for (const failure of failures) process.stdout.write(`    FAIL  ${failure}\n`);
    process.exit(1);
  }
  process.stdout.write("\n  no hard budget violations\n");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
