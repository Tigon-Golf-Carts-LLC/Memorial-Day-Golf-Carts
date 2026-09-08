/**
 * Responsive image rendering (Phase 6).
 *
 * script/optimize-assets.ts writes src/data/image-manifest.json describing every
 * derivative it produced. This module is the only thing that reads it, and every
 * <img> on the site is emitted through `renderImage()` so that:
 *
 *   - the srcset/sizes pair is consistent everywhere
 *   - explicit width/height ship on every image, so nothing shifts on load
 *   - a photo missing from the manifest degrades to the remote original rather
 *     than rendering a broken image
 *
 * Cart photography is cropped to a fixed 4:3 landscape box. The DMS photos are
 * mostly tall phone shots (1920x2560 and taller); resizing those by width alone
 * produced 500 KB–1 MB derivatives, well past the LCP budget. Cropping to 4:3
 * both fixes the size and gives the grid one predictable aspect ratio.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { esc, withBase, cartImageUrl } from "./util.ts";
import { CART_ASPECT } from "../../src/lib/photo-path.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST_PATH = resolve(root, "src/data/image-manifest.json");

export interface ImageEntry {
  /** Path relative to the site root, without a width suffix or extension. */
  base: string;
  widths: number[];
  /** Intrinsic size of the largest derivative. */
  w: number;
  h: number;
  /** Whether an .avif sibling exists for each width. */
  avif?: boolean;
  /** Descriptive, slugified filename stem (for reporting). */
  name?: string;
  /** Size of the source photograph in bytes, for the before/after report. */
  origBytes?: number;
}

export interface ImageManifest {
  updatedAt: string;
  aspect: number;
  /** Keyed by the original DMS filename. */
  carts: Record<string, ImageEntry>;
  /** Keyed by the source path under src/assets or public. */
  site: Record<string, ImageEntry>;
  stats?: Record<string, unknown>;
}

const EMPTY: ImageManifest = { updatedAt: "", aspect: 0.75, carts: {}, site: {} };

let cached: ImageManifest | null = null;

export function loadManifest(): ImageManifest {
  if (cached) return cached;
  if (!existsSync(MANIFEST_PATH)) {
    cached = EMPTY;
    return cached;
  }
  cached = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as ImageManifest;
  return cached;
}

// The crop ratio and width ladders live in src/lib/photo-path.ts, which the
// client bundle also imports, so there is one definition of the convention.
export { CART_ASPECT, PRIMARY_WIDTHS, GALLERY_WIDTHS } from "../../src/lib/photo-path.ts";

export type ImageRole = "card" | "hero" | "gallery" | "thumb";

/**
 * The `sizes` attribute per role, describing how wide the image renders so the
 * browser can pick the smallest sufficient candidate.
 */
const SIZES: Record<ImageRole, string> = {
  // Card in the inventory grid: full width on mobile, then 2, 3 and 4 up.
  card: "(min-width: 1200px) 300px, (min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw",
  // Detail-page hero: full width on mobile, ~620px in the two-column layout.
  hero: "(min-width: 1000px) 620px, 100vw",
  gallery: "(min-width: 1000px) 620px, 100vw",
  thumb: "104px",
};

export interface RenderImageOptions {
  alt: string;
  role?: ImageRole;
  /** The LCP image: eager + high priority. Everything else is lazy. */
  eager?: boolean;
  className?: string;
  /** Extra attributes, already escaped by the caller if they contain markup. */
  attrs?: Record<string, string>;
  /** Emit a <picture> with an AVIF source when the manifest has one. */
  picture?: boolean;
}

function srcsetFor(entry: ImageEntry, extension: "webp" | "avif"): string {
  return entry.widths
    .map((width) => `${withBase(`${entry.base}-${width}.${extension}`)} ${width}w`)
    .join(", ");
}

function attrString(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${esc(value)}"`)
    .join("");
}

/**
 * Render one image.
 *
 * `entry` missing (a photo the optimizer could not reach) falls back to
 * `fallbackSrc` with no srcset — the picture still shows, it just is not
 * optimized, and optimize-assets reports it.
 */
export function renderImage(
  entry: ImageEntry | null,
  fallbackSrc: string,
  options: RenderImageOptions,
): string {
  const role = options.role ?? "card";
  const eager = options.eager === true;
  const loading = eager ? "eager" : "lazy";
  const priority = eager ? ' fetchpriority="high"' : "";
  const className = options.className ? ` class="${esc(options.className)}"` : "";
  const extra = options.attrs ? attrString(options.attrs) : "";

  if (!entry) {
    // Unoptimized fallback. Intrinsic size is still declared to hold the box.
    const width = 800;
    const height = Math.round(width * CART_ASPECT);
    return (
      `<img src="${esc(fallbackSrc)}" alt="${esc(options.alt)}"` +
      ` width="${width}" height="${height}" loading="${loading}" decoding="async"${priority}${className}${extra}>`
    );
  }

  const largest = entry.widths[entry.widths.length - 1];
  const src = withBase(`${entry.base}-${largest}.webp`);
  const img =
    `<img src="${esc(src)}" srcset="${esc(srcsetFor(entry, "webp"))}"` +
    ` sizes="${esc(SIZES[role])}" alt="${esc(options.alt)}"` +
    ` width="${entry.w}" height="${entry.h}" loading="${loading}" decoding="async"${priority}${className}${extra}>`;

  if (options.picture && entry.avif) {
    return (
      `<picture>` +
      `<source type="image/avif" srcset="${esc(srcsetFor(entry, "avif"))}" sizes="${esc(SIZES[role])}">` +
      `<source type="image/webp" srcset="${esc(srcsetFor(entry, "webp"))}" sizes="${esc(SIZES[role])}">` +
      img +
      `</picture>`
    );
  }
  return img;
}

/** Look up a cart photo by its original DMS filename. */
export function cartImageEntry(filename: string | undefined): ImageEntry | null {
  if (!filename) return null;
  return loadManifest().carts[filename] ?? null;
}

/** Look up a site asset (logo, OG image, placeholder) by its source key. */
export function siteImageEntry(key: string): ImageEntry | null {
  return loadManifest().site[key] ?? null;
}

/**
 * Descriptive alt text for a cart photo (Phase 6).
 *
 * Never "image1.jpg": the alt names the year, make, model, colour, condition
 * and the city it is on the lot in, because that is what a screen-reader user
 * and an image-search crawler both need.
 */
export function cartImageAlt(
  cart: {
    year?: number | null;
    makeLabel?: string;
    modelLabel?: string;
    colorLabel?: string;
    condition?: string;
    fuel?: string;
    city?: string;
    stateCode?: string;
    features?: string[];
  },
  index = 0,
): string {
  const condition = cart.condition === "used" ? "used" : "new";
  const descriptors = [
    condition,
    cart.colorLabel?.toLowerCase(),
    cart.fuel === "electric" ? "electric" : "gas",
  ].filter(Boolean);

  const lifted = cart.features?.includes("lifted") ? "lifted " : "";
  const parts = [
    cart.year ? String(cart.year) : "",
    cart.makeLabel ?? "",
    cart.modelLabel ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const where = cart.city && cart.stateCode ? ` for sale in ${cart.city}, ${cart.stateCode}` : " for sale";
  const view = index === 0 ? "" : ` — photo ${index + 1}`;
  return `${descriptors.join(" ")} ${parts} ${lifted}golf cart${where}${view}`
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

/**
 * A <link rel="preload"> for a cart's LCP derivative.
 *
 * The grid's first card is the largest contentful paint on every listing page.
 * Preloading the exact candidate the browser would pick — matched on the same
 * `imagesizes` the img uses, so no second request is made — starts the fetch
 * during head parsing instead of after layout.
 */
export function preloadCartImage(filename: string | undefined, role: ImageRole = "card"): string {
  const entry = cartImageEntry(filename);
  if (!entry) return "";
  return (
    `<link rel="preload" as="image" type="image/webp"` +
    ` href="${esc(withBase(`${entry.base}-${entry.widths[entry.widths.length - 1]}.webp`))}"` +
    ` imagesrcset="${esc(srcsetFor(entry, "webp"))}"` +
    ` imagesizes="${esc(SIZES[role])}" fetchpriority="high">`
  );
}

/** The absolute URL of a cart's OG image, for social cards and schema. */
export function cartOgImage(cart: { images?: string[] }): string {
  const first = cart.images?.[0];
  const entry = cartImageEntry(first);
  if (entry) return `${entry.base}-1200.webp`;
  return first ? cartImageUrl(first) : "images/og-image.png";
}
