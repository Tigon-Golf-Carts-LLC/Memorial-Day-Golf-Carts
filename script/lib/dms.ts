/**
 * Dealer management system (DMS) API client.
 *
 * The DMS is public (no key) but every read endpoint except /tigon-stores is a
 * POST. Requests are retried with backoff because the scheduled refresh is
 * unattended and a single transient failure should not blank the site.
 *
 * This module is used by script/fetch-data.ts at build time only. Nothing here
 * ships to the browser — the published site reads static JSON.
 */

import { DMS_BASE_URL } from "../../src/config/site.ts";

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

async function request<T>(endpoint: string, body?: unknown): Promise<T> {
  const url = `${DMS_BASE_URL}${endpoint}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (attempt > 0) {
      const wait = 2000 * 2 ** (attempt - 1);
      process.stderr.write(`  retry ${attempt}/${RETRIES} for ${endpoint} in ${wait}ms\n`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: body
          ? { "Content-Type": "application/json", Accept: "application/json" }
          : { Accept: "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`DMS ${endpoint} responded ${response.status} ${response.statusText}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new DmsError(
    `DMS ${endpoint} failed after ${RETRIES + 1} attempts: ${(lastError as Error)?.message ?? lastError}`,
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
export function getStores(): Promise<DmsStore[]> {
  return request<DmsStore[]>("/tigon-stores");
}

/** One page of inventory. */
export function getCarts(body: Record<string, unknown> = {}): Promise<{ carts?: unknown[]; totalCarts?: number }> {
  return request("/get-carts", { pageNumber: 0, pageSize: 100, ...body });
}

/** A single cart by its Mongo _id. */
export function getCartById(cartId: string): Promise<unknown> {
  return request("/get-cart-by-id", { cartId });
}

/** Models available for the given make keys. */
export function getCartModels(makeKeys: string[]): Promise<unknown> {
  return request("/get-cart-models", { makeKeys });
}

/** Colors available for the given make keys. */
export function getCartColors(makeKeys: string[]): Promise<unknown> {
  return request("/get-cart-colors", { makeKeys });
}

/** Featured/promoted carts. */
export function getFeaturedCarts(key = "national"): Promise<unknown> {
  return request("/get-featured-carts", { key });
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
export async function getAllCarts({ pageSize = 100, maxPages = 200 } = {}): Promise<{
  carts: any[];
  totalCarts: number;
  reportedTotal: number | null;
}> {
  const byId = new Map<string, any>();
  let reportedTotal: number | null = null;
  let barrenPages = 0;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const data = await getCarts({ pageNumber, pageSize });
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
  return { carts, totalCarts: carts.length, reportedTotal };
}
