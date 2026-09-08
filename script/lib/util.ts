/** Shared helpers used by the fetch step, every page renderer and the SEO files. */

import { S3_CARTS_URL, PLACEHOLDER_IMAGE, site } from "../../src/config/site.ts";

/**
 * Phase 5 — the deployment base path.
 *
 * "/" for a custom domain or <user>.github.io; "/<repo-name>/" for a project
 * site. Everything that emits a URL into the HTML goes through `withBase()`, so
 * there is exactly one place that needs to change when the site moves.
 */
export const BASE_PATH = normalizeBase(process.env.BASE_PATH || "/");

function normalizeBase(value: string): string {
  let base = String(value || "/").trim();
  if (!base.startsWith("/")) base = `/${base}`;
  if (!base.endsWith("/")) base = `${base}/`;
  return base.replace(/\/{2,}/g, "/");
}

/** The absolute origin used for canonicals, OG tags and sitemap entries. */
export const SITE_ORIGIN = (process.env.SITE_DOMAIN
  ? `https://${String(process.env.SITE_DOMAIN).replace(/^https?:\/\//, "").replace(/\/$/, "")}`
  : site.url
).replace(/\/$/, "");

/**
 * Turn a site-root-relative path into a href that honours BASE_PATH.
 *
 * Absolute URLs, protocol-relative URLs, fragments, `tel:` and `mailto:` pass
 * through untouched — prefixing those would break them.
 */
export function withBase(path: string): string {
  const value = String(path ?? "");
  if (!value) return BASE_PATH;
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(value)) return value;
  return (BASE_PATH + value.replace(/^\/+/, "")).replace(/\/{2,}/g, "/");
}

/** Alias that reads better at asset call sites. */
export const asset = withBase;

/** The full absolute URL for a site path — canonicals, OG, sitemaps. */
export function absoluteUrl(path: string): string {
  const value = String(path ?? "/");
  if (/^https?:\/\//i.test(value)) return value;
  return SITE_ORIGIN + withBase(value);
}

/** Escape a string for interpolation into HTML text or a double-quoted attribute. */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape a string for XML text content (sitemaps, feeds). */
export const xmlEsc = esc;

/**
 * Serialize an object as JSON-LD safe for embedding inside a <script> tag.
 *
 * Minified: the indent carried no SEO value and accounted for roughly a quarter
 * of every rendered page. `<` and `>` are escaped so a string value can never
 * terminate the script element early.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

/** Lowercase, hyphen-separated, URL-safe slug part. */
export function toSlugPart(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The DMS filter-key format for makes: lowercase with underscores ("Club Car" -> "club_car"). */
export function toMakeKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_");
}

/**
 * The DMS price, exactly as it is set, or "Call for Price" when there is none.
 *
 * Cents are shown only when the price actually has them. Most carts are priced
 * in whole dollars and read better as "$12,995" than "$12,995.00"; a handful
 * carry cents, and rounding those would publish a price the dealership is not
 * asking. One formatter is used everywhere so a card and a vehicle page can
 * never disagree.
 */
export function formatPrice(price: unknown): string {
  const value = Number(price);
  if (!value || !Number.isFinite(value) || value <= 0) return "Call for Price";
  const hasCents = !Number.isInteger(value);
  return (
    "$" +
    value.toLocaleString("en-US", {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

/** Alias kept for call sites that read as a short/headline price. */
export const formatPriceShort = formatPrice;

/** Monthly payment at 0% APR over 48 months. */
export function monthlyPayment(price: unknown, months = 48): number | null {
  if (!price || Number(price) <= 0) return null;
  return Number(price) / months;
}

/** Build a full public S3 URL from a DMS image filename (the raw original). */
export function cartImageUrl(filename: string): string {
  if (!filename) return withBase(PLACEHOLDER_IMAGE);
  if (/^https?:\/\//i.test(filename)) return filename;
  return S3_CARTS_URL + String(filename).replace(/^\/+/, "");
}

/** True when a cart has at least one public photograph. */
export function hasRealPhotos(cart: { images?: unknown[] }): boolean {
  return Array.isArray(cart?.images) && cart.images.length > 0;
}

/** "Denago Nomad XL Gray" from make / model / color, skipping whatever is missing. */
export function buildCartTitle(make?: string, model?: string, color?: string): string {
  const parts: string[] = [];
  if (make && model) parts.push(`${make} ${model}`);
  else if (make) parts.push(make);
  else if (model) parts.push(model);
  if (color) parts.push(color);
  return parts.join(" ") || "Golf Cart";
}

/** Today in YYYY-MM-DD. */
export function isoDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Full ISO-8601 timestamp with a +00:00 offset (sitemap lastmod format). */
export function isoStamp(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

/** RFC-822 date, required by RSS. */
export function rfc822(date: Date | string = new Date()): string {
  return new Date(date).toUTCString();
}

/** Chunk an array into fixed-size groups. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Unique, order-preserving. */
export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Trim text to a length that fits a meta description without cutting mid-word. */
export function clamp(text: unknown, max = 155): string {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,.;:]$/, "") + "…";
}

/** Title-case a hyphenated slug for display. */
export function titleize(slug: unknown): string {
  return String(slug ?? "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
