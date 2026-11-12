/**
 * Inventory API client for both inventory sources.
 *
 *   DMS — https://api.tigondms.com/wp-website — primary, no key.
 *   IOT — https://tigoniot.com/wp-website     — recovery copy of the DMS feed,
 *         refreshed from the DMS once a day. Same paths, bodies and payloads;
 *         every request carries the key in the `x-api-key` header (never the
 *         ?apiKey= query parameter).
 *
 * Every read endpoint except /tigon-stores is a POST. Requests are retried with
 * backoff because the scheduled refresh is unattended and a single transient
 * failure should not blank the site.
 *
 * This module is used by script/fetch-data.ts at build time only. Nothing here
 * ships to the browser — the published site reads static JSON — and the IOT
 * key is read from the environment here and nowhere else. It is never logged:
 * error messages carry the source name and endpoint, not the URL or headers.
 */

import { DMS_BASE_URL } from "../../src/config/site.ts";

export type InventorySource = "DMS" | "IOT";

const IOT_BASE_URL = process.env.IOT_BASE_URL || "https://tigoniot.com/wp-website";

/** Whether the IOT recovery source can be used (its key is configured). */
export function iotConfigured(): boolean {
  return Boolean(process.env.IOT_API_KEY?.trim());
}

function baseUrl(source: InventorySource): string {
  return source === "IOT" ? IOT_BASE_URL : DMS_BASE_URL;
}

function authHeaders(source: InventorySource): Record<string, string> {
  if (source !== "IOT") return {};
  const key = process.env.IOT_API_KEY?.trim();
  if (!key) throw new DmsError("IOT_API_KEY is not set", "(config)", 0);
  return { "x-api-key": key };
}

/**
 * DMS requests may not start at or after this instant (5:00 AM ET). Checked
 * before every request, page and retry; a request's timeout never runs past it.
 */
let dmsDeadline = Number.POSITIVE_INFINITY;
export function setDmsDeadline(at: number) {
  dmsDeadline = at;
}

/** Status codes that will not get better by asking again. */
const NO_RETRY = new Set([400, 401, 403, 404]);

const RETRIES = Number(process.env.DMS_RETRIES ?? 4);
const TIMEOUT_MS = Number(process.env.DMS_TIMEOUT_MS ?? 45_000);

export class DmsError extends Error {
  endpoint: string;
  attempts: number;
  constructor(message: string, endpoint: string, attempts: number) {
    super(message);
    this.name = "DmsError";
    this.endpoint = endpoint;
    this.attempts = attempts;
  }
}

async function request<T>(source: InventorySource, endpoint: string, body?: unknown): Promise<T> {
  const url = `${baseUrl(source)}${endpoint}`;
  const auth = authHeaders(source);
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (attempt > 0) {
      const wait = 2000 * 2 ** (attempt - 1);
      process.stderr.write(`  retry ${attempt}/${RETRIES} for ${endpoint} in ${wait}ms\n`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    let timeout = TIMEOUT_MS;
    if (source === "DMS") {
      const left = dmsDeadline - Date.now();
      if (left <= 0) {
        throw new DmsError("5:00 AM ET cutoff reached — no DMS request sent", endpoint, attempt);
      }
      timeout = Math.min(TIMEOUT_MS, left);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: body
          ? { "Content-Type": "application/json", Accept: "application/json", ...auth }
          : { Accept: "application/json", ...auth },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`${source} ${endpoint} responded ${response.status} ${response.statusText}`);
        if (NO_RETRY.has(response.status)) throw new DmsError(error.message, endpoint, attempt + 1);
        throw error;
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DmsError) throw error;
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new DmsError(
    `${source} ${endpoint} failed after ${RETRIES + 1} attempts: ${(lastError as Error)?.message ?? lastError}`,
    endpoint,
    RETRIES + 1,
  );
}

export interface DmsStore {
  _id?: string;
  storeId?: string;
  address?: { city?: string; state?: string; address1?: string; address2?: string; postalCode?: string; country?: string };
}

/** All dealership stores. */
export function getStores(source: InventorySource = "DMS"): Promise<DmsStore[]> {
  return request<DmsStore[]>(source, "/tigon-stores");
}

/** One page of inventory. */
export function getCarts(
  body: Record<string, unknown> = {},
  source: InventorySource = "DMS",
): Promise<{ carts?: unknown[]; totalCarts?: number }> {
  return request(source, "/get-carts", { pageNumber: 0, pageSize: 100, isAllCarts: true, ...body });
}

/** A single cart by its Mongo _id. */
export function getCartById(cartId: string): Promise<unknown> {
  return request("DMS", "/get-cart-by-id", { cartId });
}

/** Models available for the given make keys. */
export function getCartModels(makeKeys: string[]): Promise<unknown> {
  return request("DMS", "/get-cart-models", { makeKeys });
}

/** Colors available for the given make keys. */
export function getCartColors(makeKeys: string[]): Promise<unknown> {
  return request("DMS", "/get-cart-colors", { makeKeys });
}

/** Featured/promoted carts. */
export function getFeaturedCarts(key = "national"): Promise<unknown> {
  return request("DMS", "/get-featured-carts", { key });
}

/**
 * Walk /get-carts until the catalogue is exhausted.
 *
 * The first page's `totalCarts` is treated as a hint, not a stop condition: it
 * has been observed to disagree with the number of records the endpoint will
 * actually serve. Paging therefore continues until an empty page arrives or
 * repeated pages add nothing new, and records are keyed by `_id` so an unstable
 * server-side sort cannot produce duplicates.
 *
 * A short page is deliberately NOT treated as the last one: the endpoint has
 * been seen to return fewer records than requested mid-catalogue, and stopping
 * there silently truncated the inventory.
 */
export async function getAllCarts({
  pageSize = 100,
  maxPages = 200,
  source = "DMS" as InventorySource,
  /** Keep the pages already collected if a later page fails (relaxed mode only). */
  keepPartial = false,
} = {}): Promise<{
  carts: any[];
  totalCarts: number;
  reportedTotal: number | null;
  /** Set when a page failed and the walk stopped early (relaxed mode only). */
  partialError: string | null;
}> {
  const byId = new Map<string, any>();
  let reportedTotal: number | null = null;
  let barrenPages = 0;
  let partialError: string | null = null;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    let data: { carts?: unknown[]; totalCarts?: number };
    try {
      data = await getCarts({ pageNumber, pageSize }, source);
    } catch (error) {
      // The first page failing is always fatal; a later one is fatal unless
      // the caller explicitly accepts a partial catalogue.
      if (!keepPartial || byId.size === 0) throw error;
      partialError = `page ${pageNumber} failed: ${(error as Error).message}`;
      process.stderr.write(`  ${partialError} — keeping the ${byId.size} records already collected\n`);
      break;
    }
    const page = Array.isArray(data?.carts) ? (data.carts as any[]) : [];
    if (reportedTotal === null) reportedTotal = Number(data?.totalCarts) || null;

    let added = 0;
    for (const cart of page) {
      if (!cart?._id || byId.has(cart._id)) continue;
      byId.set(cart._id, cart);
      added += 1;
    }
    process.stderr.write(`  page ${pageNumber}: ${page.length} returned, ${added} new (${byId.size} total)\n`);

    if (page.length === 0) {
      barrenPages += 1;
      if (barrenPages >= 2) break;
      continue;
    }
    if (added === 0) {
      barrenPages += 1;
      if (barrenPages >= 3) {
        process.stderr.write("  paging stopped advancing; ending the walk\n");
        break;
      }
    } else {
      barrenPages = 0;
    }
  }

  const carts = [...byId.values()];
  process.stderr.write(`  collected ${carts.length} records\n`);
  if (reportedTotal !== null && carts.length !== reportedTotal) {
    process.stderr.write(`  note: endpoint reported totalCarts=${reportedTotal}, walk collected ${carts.length}\n`);
  }
  return { carts, totalCarts: carts.length, reportedTotal, partialError };
}
