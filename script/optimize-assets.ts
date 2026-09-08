#!/usr/bin/env node
/**
 * Phase 6 — image and asset optimization.
 *
 * Processes every image the site ships:
 *
 *   1. Cart photography, pulled from the DMS S3 bucket by filename. Cropped to
 *      a fixed 4:3 landscape box and encoded to WebP at responsive widths.
 *      The primary photo of each cart also gets AVIF, because that is the LCP
 *      candidate and the only place AVIF's much slower encode pays for itself.
 *   2. Site imagery under src/assets (SVG through SVGO) and public/ (PNG
 *      losslessly recompressed, EXIF stripped).
 *
 * Derivatives land in public/images/carts/ with descriptive slugified names, so
 * Vite copies them into dist/. Raw originals are optional (`--keep-originals`)
 * and land in assets-raw/carts/, which is outside the deployed output and
 * git-ignored.
 *
 * A photo that cannot be downloaded is recorded as unoptimized rather than
 * failing the build: the page falls back to the remote original and the run
 * reports the count.
 *
 * Usage:
 *   node script/optimize-assets.ts               # everything
 *   node script/optimize-assets.ts --limit 40    # first 40 carts (development)
 *   node script/optimize-assets.ts --skip-carts  # site assets only
 *   node script/optimize-assets.ts --keep-originals
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, extname, basename } from "node:path";
import sharp from "sharp";
import { optimize as svgoOptimize } from "svgo";

import { S3_CARTS_URL } from "../src/config/site.ts";
import { toSlugPart, isoStamp } from "./lib/util.ts";
import { type ImageManifest, type ImageEntry } from "./lib/images.ts";
import { photoStem as sharedPhotoStem, PRIMARY_WIDTHS, GALLERY_WIDTHS, CART_ASPECT } from "../src/lib/photo-path.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = resolve(root, "src/data/snapshot.json");
const MANIFEST = resolve(root, "src/data/image-manifest.json");
const CART_OUT = resolve(root, "public/images/carts");
const SITE_OUT = resolve(root, "public/images");
const RAW_OUT = resolve(root, "assets-raw/carts");

/**
 * The manifest from the previous run, if any. Used only to carry forward the
 * recorded original byte size of photos this run serves from cache.
 */
const previousManifest: ImageManifest | null = (() => {
  try {
    return JSON.parse(readFileSync(resolve(root, "src/data/image-manifest.json"), "utf8")) as ImageManifest;
  } catch {
    return null;
  }
})();

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string, fallback: number) => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const parsed = Number(args[index + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const LIMIT = value("--limit", Infinity);
const CONCURRENCY = value("--concurrency", 6);
const SKIP_CARTS = flag("--skip-carts");
const KEEP_ORIGINALS = flag("--keep-originals");
const FORCE = flag("--force");

/**
 * The image budget, in megabytes, that cart photography may occupy in dist/.
 *
 * GitHub Pages caps a published site at 1 GB and script/budget.ts hard-fails
 * past 500 MB. At the measured ~0.182 MB per photo across three widths plus
 * AVIF, a 255-cart catalogue costs 188 MB and an 800-cart one would cost 591 MB
 * — so the ladder cannot be fixed, it has to scale with the inventory.
 */
const IMAGE_BUDGET_MB = Number(process.env.IMAGE_BUDGET_MB ?? 350);

/**
 * Derivative ladders, richest first. The first one that fits the budget for the
 * current catalogue size is used, and the choice is logged.
 *
 * `galleryWidths: []` means the non-primary photographs are not optimized at
 * all: they have no manifest entry, so renderImage() falls back to the original
 * on the DMS S3 bucket. Those are below-the-fold, lazily-loaded images on a
 * detail page the visitor deliberately opened — the card, the hero, the OG
 * image and the LCP element all come from the primary photo, which is always
 * optimized.
 */
interface Ladder {
  name: string;
  primaryWidths: number[];
  galleryWidths: number[];
  avif: boolean;
  note: string;
}

const LADDERS: Ladder[] = [
  { name: "rich", primaryWidths: [400, 800, 1200], galleryWidths: [400, 800], avif: true,
    note: "3 primary widths + AVIF, 2 gallery widths" },
  { name: "standard", primaryWidths: [400, 800, 1200], galleryWidths: [400, 800], avif: false,
    note: "3 primary widths, 2 gallery widths, no AVIF" },
  { name: "compact", primaryWidths: [400, 800, 1200], galleryWidths: [800], avif: false,
    note: "3 primary widths, 1 gallery width, no AVIF" },
  { name: "lean", primaryWidths: [400, 800, 1200], galleryWidths: [], avif: false,
    note: "3 primary widths; gallery photos served from the DMS bucket" },
  { name: "minimal", primaryWidths: [400, 800], galleryWidths: [], avif: false,
    note: "2 primary widths; gallery photos served from the DMS bucket" },
];

/** Measured average bytes per derivative at each width (4:3 crop, WebP q76). */
const MEASURED_KB: Record<number, number> = { 400: 24, 800: 88, 1200: 185 };
const AVIF_RATIO = 0.65;

/** Megabytes a ladder would produce for the given photo distribution. */
function projectMb(ladder: Ladder, cartCount: number, photoCount: number): number {
  const sum = (widths: number[]) => widths.reduce((total, width) => total + (MEASURED_KB[width] ?? 100), 0);
  const primaryKb = sum(ladder.primaryWidths) * (ladder.avif ? 1 + AVIF_RATIO : 1);
  const galleryKb = sum(ladder.galleryWidths);
  const galleryCount = Math.max(0, photoCount - cartCount);
  return (cartCount * primaryKb + galleryCount * galleryKb) / 1024;
}

/** Pick the richest ladder that fits the budget. */
function chooseLadder(cartCount: number, photoCount: number): Ladder {
  for (const ladder of LADDERS) {
    if (projectMb(ladder, cartCount, photoCount) <= IMAGE_BUDGET_MB) return ladder;
  }
  return LADDERS[LADDERS.length - 1];
}

/** WebP quality. 76 keeps a 800x600 cart photo under ~90 KB with no visible loss. */
const WEBP_QUALITY = 76;
const AVIF_QUALITY = 55;
/** Nothing is stored above this on its longest edge (Phase 6: cap ~2000px). */
const MAX_EDGE = 2000;

interface Stats {
  originalBytes: number;
  derivativeBytes: number;
  photosProcessed: number;
  photosSkippedCached: number;
  photosFailed: number;
  derivativesWritten: number;
  avifWritten: number;
  siteAssets: number;
  svgBefore: number;
  svgAfter: number;
  pngBefore: number;
  pngAfter: number;
}

const stats: Stats = {
  originalBytes: 0, derivativeBytes: 0, photosProcessed: 0, photosSkippedCached: 0,
  photosFailed: 0, derivativesWritten: 0, avifWritten: 0, siteAssets: 0,
  svgBefore: 0, svgAfter: 0, pngBefore: 0, pngAfter: 0,
};

const failures: Array<{ file: string; reason: string }> = [];

/* ------------------------------------------------------------- download --- */

async function download(url: string, attempts = 3): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(String((lastError as Error)?.message ?? lastError));
}

/* ------------------------------------------------------------ cart photos --- */

/**
 * Descriptive, slugified stem for a cart photo.
 * "denago-nomad-xl-matte-black-hatfield-pennsylvania-1" — never the DMS UUID.
 *
 * The cart's snapshot slug is the base rather than a stem re-derived from the
 * labels. Two different carts can share make, model, colour and city — 374 of
 * our 969 photos did — and a label-derived stem made them collide, so one
 * cart's photographs silently overwrote another's. The slug already carries the
 * -01/-02 disambiguator that makes it unique per cart.
 */
function photoStem(cart: any, index: number): string {
  return sharedPhotoStem(cart.slug || `golf-cart-${cart.id}`, index);
}

interface PhotoJob {
  filename: string;
  stem: string;
  widths: number[];
  wantAvif: boolean;
}

async function processPhoto(job: PhotoJob, manifest: ImageManifest): Promise<void> {
  const outputs = job.widths.flatMap((width) => [
    { path: join(CART_OUT, `${job.stem}-${width}.webp`), width, format: "webp" as const },
    ...(job.wantAvif ? [{ path: join(CART_OUT, `${job.stem}-${width}.avif`), width, format: "avif" as const }] : []),
  ]);

  const entry: ImageEntry = {
    base: `images/carts/${job.stem}`,
    widths: job.widths,
    w: job.widths[job.widths.length - 1],
    h: Math.round(job.widths[job.widths.length - 1] * CART_ASPECT),
    avif: job.wantAvif,
    name: job.stem,
  };

  // Already generated: reuse, so a re-run or a cached CI workspace is cheap.
  if (!FORCE && outputs.every((output) => existsSync(output.path))) {
    for (const output of outputs) stats.derivativeBytes += statSync(output.path).size;
    stats.photosSkippedCached += 1;
    // The original was not downloaded this run, so its size comes from the
    // previous manifest. Without that, the before/after table would understate
    // the original bytes by however many photos were served from cache.
    const remembered = previousManifest?.carts?.[job.filename]?.origBytes;
    if (remembered) stats.originalBytes += remembered;
    entry.origBytes = remembered;
    manifest.carts[job.filename] = entry;
    return;
  }

  let original: Buffer;
  const rawPath = join(RAW_OUT, job.filename);
  try {
    if (existsSync(rawPath)) {
      original = readFileSync(rawPath);
    } else {
      original = await download(S3_CARTS_URL + job.filename);
      if (KEEP_ORIGINALS) {
        mkdirSync(RAW_OUT, { recursive: true });
        writeFileSync(rawPath, original);
      }
    }
  } catch (error) {
    stats.photosFailed += 1;
    failures.push({ file: job.filename, reason: (error as Error).message });
    // No manifest entry: renderImage() falls back to the remote original.
    return;
  }

  stats.originalBytes += original.length;
  entry.origBytes = original.length;

  for (const output of outputs) {
    const height = Math.round(output.width * CART_ASPECT);
    // `fit: cover` crops to the 4:3 box; `withoutEnlargement` never upscales a
    // small source. Metadata is dropped by default (no .withMetadata() call),
    // which strips EXIF including any GPS coordinates in a dealer's phone shot.
    let pipeline = sharp(original, { failOn: "none" })
      .rotate()
      .resize({
        width: Math.min(output.width, MAX_EDGE),
        height: Math.min(height, MAX_EDGE),
        fit: "cover",
        position: "centre",
        withoutEnlargement: true,
      });
    pipeline =
      output.format === "webp"
        ? pipeline.webp({ quality: WEBP_QUALITY, effort: 5 })
        : pipeline.avif({ quality: AVIF_QUALITY, effort: 4 });

    const buffer = await pipeline.toBuffer();
    writeFileSync(output.path, buffer);
    stats.derivativeBytes += buffer.length;
    stats.derivativesWritten += 1;
    if (output.format === "avif") stats.avifWritten += 1;
  }

  stats.photosProcessed += 1;
  manifest.carts[job.filename] = entry;
}

/** Run jobs with bounded concurrency and a progress line. */
async function runPool(jobs: PhotoJob[], manifest: ImageManifest): Promise<void> {
  let next = 0;
  let done = 0;
  const total = jobs.length;

  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= total) return;
      await processPhoto(jobs[index], manifest);
      done += 1;
      if (done % 50 === 0 || done === total) {
        process.stderr.write(
          `  ${done}/${total} photos (${stats.photosProcessed} encoded, ` +
            `${stats.photosSkippedCached} cached, ${stats.photosFailed} failed)\n`,
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));
}

/* ----------------------------------------------------------- site assets --- */

/** Run every SVG under src/assets through SVGO and emit it to public/images. */
function optimizeSvgs(manifest: ImageManifest): void {
  const source = resolve(root, "src/assets");
  if (!existsSync(source)) return;
  mkdirSync(SITE_OUT, { recursive: true });

  for (const file of readdirSync(source)) {
    if (extname(file).toLowerCase() !== ".svg") continue;
    const input = readFileSync(join(source, file), "utf8");
    stats.svgBefore += Buffer.byteLength(input);
    // SVGO v4 dropped removeViewBox from preset-default, so viewBox is kept
    // without an override. removeDimensions strips width/height so the SVG
    // scales to whatever box the CSS gives it.
    const result = svgoOptimize(input, {
      multipass: true,
      plugins: ["preset-default", "removeDimensions"],
    });
    const output = result.data;
    stats.svgAfter += Buffer.byteLength(output);
    writeFileSync(join(SITE_OUT, file), output, "utf8");
    stats.siteAssets += 1;
    manifest.site[`src/assets/${file}`] = {
      base: `images/${basename(file, ".svg")}`,
      widths: [],
      w: 0,
      h: 0,
      name: basename(file, ".svg"),
    };
  }
  // A PNG copy of the logo for schema.org consumers that reject SVG.
  const iconSource = resolve(root, "public/icons/icon-512.png");
  if (existsSync(iconSource)) writeFileSync(resolve(SITE_OUT, "logo.png"), readFileSync(iconSource));
}

/**
 * Losslessly recompress every PNG that must stay a PNG (favicons, app icons,
 * OG images) and emit a WebP sibling for the OG art, which is large.
 */
async function optimizePngs(manifest: ImageManifest): Promise<void> {
  const targets = [resolve(root, "public/icons"), resolve(root, "public/images")];
  for (const directory of targets) {
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory)) {
      if (extname(file).toLowerCase() !== ".png") continue;
      const path = join(directory, file);
      const before = readFileSync(path);
      stats.pngBefore += before.length;
      // Lossless: maximum zlib level and filter search, no palette
      // quantization. Every icon here is flat-colour art that already fits a
      // palette, so this gives the same size with no risk of banding the OG art.
      const after = await sharp(before, { failOn: "none" })
        .png({ compressionLevel: 9, effort: 10 })
        .toBuffer();
      const winner = after.length < before.length ? after : before;
      stats.pngAfter += winner.length;
      if (winner !== before) writeFileSync(path, winner);
      stats.siteAssets += 1;
    }
  }

  // The OG image is the one raster the pages reference directly; give it a
  // WebP form and record its intrinsic size.
  const og = resolve(root, "public/images/og-image.png");
  if (existsSync(og)) {
    const meta = await sharp(og).metadata();
    const webp = await sharp(og).webp({ quality: 82, effort: 5 }).toBuffer();
    writeFileSync(resolve(SITE_OUT, "og-image.webp"), webp);
    stats.derivativeBytes += webp.length;
    manifest.site["public/images/og-image.png"] = {
      base: "images/og-image",
      widths: [meta.width ?? 1200],
      w: meta.width ?? 1200,
      h: meta.height ?? 630,
      name: "og-image",
    };
  }
}

/* -------------------------------------------------------------------- run --- */

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

async function main() {
  if (!existsSync(SNAPSHOT)) {
    process.stderr.write("FATAL: src/data/snapshot.json is missing. Run `npm run fetch-data` first.\n");
    process.exit(1);
  }
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const manifest: ImageManifest = { updatedAt: isoStamp(), aspect: CART_ASPECT, carts: {}, site: {} };

  mkdirSync(CART_OUT, { recursive: true });

  if (!SKIP_CARTS) {
    const carts = Number.isFinite(LIMIT) ? snapshot.carts.slice(0, LIMIT) : snapshot.carts;
    const photoCount = carts.reduce((total: number, cart: any) => total + cart.images.length, 0);
    const ladder = chooseLadder(carts.length, photoCount);

    process.stderr.write(
      `\n${"-".repeat(72)}\nImage ladder: ${ladder.name} — ${ladder.note}\n${"-".repeat(72)}\n`,
    );
    for (const candidate of LADDERS) {
      const mb = projectMb(candidate, carts.length, photoCount);
      process.stderr.write(
        `  ${candidate === ladder ? "->" : "  "} ${candidate.name.padEnd(9)} ` +
          `${mb.toFixed(0).padStart(5)} MB  ${mb <= IMAGE_BUDGET_MB ? "fits" : "over"} ` +
          `the ${IMAGE_BUDGET_MB} MB budget\n`,
      );
    }
    if (!ladder.galleryWidths.length) {
      process.stderr.write(
        `\n  Gallery photographs are not being optimized at this catalogue size.\n` +
          `  Cards, heroes, OG images and every LCP element use the primary photo,\n` +
          `  which is optimized; the remaining gallery shots load lazily from the\n` +
          `  DMS bucket on the detail page. Raise IMAGE_BUDGET_MB to change this.\n`,
      );
    }

    const jobs: PhotoJob[] = [];
    for (const cart of carts) {
      cart.images.forEach((filename: string, index: number) => {
        const widths = index === 0 ? ladder.primaryWidths : ladder.galleryWidths;
        // An empty ladder for this role means "leave it on the origin bucket".
        if (!widths.length) return;
        jobs.push({
          filename,
          stem: photoStem(cart, index),
          widths: [...widths],
          wantAvif: index === 0 && ladder.avif,
        });
      });
    }
    process.stderr.write(
      `\nOptimizing ${jobs.length} of ${photoCount} cart photos from ${carts.length} carts ` +
        `(concurrency ${CONCURRENCY}, WebP q${WEBP_QUALITY}, 4:3 crop)\n`,
    );
    await runPool(jobs, manifest);
  }

  process.stderr.write("Optimizing site assets (SVGO, PNG recompression)...\n");
  optimizeSvgs(manifest);
  await optimizePngs(manifest);

  writeJsonManifest(manifest);
  report();
}

function writeJsonManifest(manifest: ImageManifest) {
  manifest.stats = {
    originalBytes: stats.originalBytes,
    derivativeBytes: stats.derivativeBytes,
    photosProcessed: stats.photosProcessed,
    photosSkippedCached: stats.photosSkippedCached,
    photosFailed: stats.photosFailed,
    derivativesWritten: stats.derivativesWritten,
  };
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest), "utf8");
}

function report() {
  const fetched = stats.originalBytes;
  const produced = stats.derivativeBytes;
  process.stderr.write(`\n${"-".repeat(72)}\nAsset optimization\n${"-".repeat(72)}\n`);
  process.stderr.write(`  cart photos encoded      ${stats.photosProcessed}\n`);
  process.stderr.write(`  reused from cache        ${stats.photosSkippedCached}\n`);
  process.stderr.write(`  derivatives written      ${stats.derivativesWritten} (${stats.avifWritten} AVIF)\n`);
  process.stderr.write(`  unreachable photos       ${stats.photosFailed}\n`);
  if (fetched > 0) {
    process.stderr.write(
      `\n  originals downloaded     ${mb(fetched)}\n` +
        `  derivatives produced     ${mb(produced)}\n` +
        `  reduction                ${(100 - (produced / fetched) * 100).toFixed(1)}%\n`,
    );
  } else {
    process.stderr.write(`\n  derivatives on disk      ${mb(produced)}\n`);
  }
  if (stats.svgBefore) {
    process.stderr.write(
      `\n  SVG   ${kb(stats.svgBefore)} -> ${kb(stats.svgAfter)} ` +
        `(${(100 - (stats.svgAfter / stats.svgBefore) * 100).toFixed(1)}% smaller)\n`,
    );
  }
  if (stats.pngBefore) {
    process.stderr.write(
      `  PNG   ${kb(stats.pngBefore)} -> ${kb(stats.pngAfter)} ` +
        `(${(100 - (stats.pngAfter / stats.pngBefore) * 100).toFixed(1)}% smaller)\n`,
    );
  }
  if (failures.length) {
    process.stderr.write(`\n  ${failures.length} photos could not be optimized (page falls back to the S3 original):\n`);
    for (const failure of failures.slice(0, 10)) {
      process.stderr.write(`    ${failure.file} — ${failure.reason}\n`);
    }
    if (failures.length > 10) process.stderr.write(`    …and ${failures.length - 10} more\n`);
  }
  process.stderr.write(`\n  manifest written to src/data/image-manifest.json\n`);
}

/**
 * Only run when executed directly. Importing this module (from a test, or
 * another script that wants one of its helpers) must not fire a network fetch.
 */
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`\nFATAL: ${error.stack ?? error}\n`);
    process.exit(1);
  });
}
