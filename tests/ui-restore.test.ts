/**
 * Phase 3 requirements 1, 4 and 6, checked in a real browser.
 *
 * The unit tests in filters.test.ts prove the engine is correct; these prove
 * the page actually wires it up — that a four-filter URL restores four
 * controls, that back/forward works, and that returning from a detail page
 * keeps the filters.
 *
 * Skipped with a clear message when dist/ has not been built, so `npm test`
 * still runs on a clean checkout.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, extname, normalize } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(root, "dist");
const built = existsSync(join(DIST, "index.html"));

/**
 * Whether a Playwright browser is actually installed.
 *
 * Runners ship none, so `npx playwright install chromium` has to run first —
 * both workflows do that. Outside CI a missing browser is not a failure: it
 * just means `npm test` on a fresh clone runs the filter tests and reports
 * these as skipped, rather than dying with a raw Playwright stack trace.
 *
 * In CI a missing browser IS a failure: the workflow is supposed to install it,
 * and silently skipping would mean the browser tests quietly stopped running.
 */
async function browserAvailable(): Promise<{ ok: boolean; reason: string }> {
  if (!built) return { ok: false, reason: "dist/ not built — run `npm run build` first" };
  try {
    const { chromium } = await import("playwright");
    const path = chromium.executablePath();
    if (existsSync(path)) return { ok: true, reason: "" };
    return {
      ok: false,
      reason: `no Playwright browser at ${path} — run \`npx playwright install chromium\``,
    };
  } catch (error) {
    return { ok: false, reason: `playwright is not installed: ${(error as Error).message}` };
  }
}

const availability = await browserAvailable();
if (!availability.ok && process.env.CI) {
  // Never let a misconfigured runner turn the browser suite into a silent no-op.
  throw new Error(
    `Browser tests cannot run in CI: ${availability.reason}\n` +
      "The workflow must run `npx playwright install --with-deps chromium` before `npm test`.",
  );
}
if (!availability.ok) {
  process.stderr.write(`\nSkipping the browser tests: ${availability.reason}\n\n`);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

let server: Server;
let origin = "";
let browser: any;
/** Console errors and failed requests seen across the whole run. */
const consoleErrors: string[] = [];
const failedRequests: string[] = [];

function startServer(): Promise<string> {
  return new Promise((resolvePromise) => {
    server = createServer((request, response) => {
      const pathname = decodeURIComponent((request.url ?? "/").split("?")[0]);
      const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
      let target = join(DIST, safe);
      if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
      if (!existsSync(target) || !statSync(target).isFile()) {
        const notFound = join(DIST, "404.html");
        const body = existsSync(notFound) ? readFileSync(notFound) : Buffer.from("not found");
        response.writeHead(404, { "Content-Type": TYPES[".html"] });
        response.end(body);
        return;
      }
      response.writeHead(200, { "Content-Type": TYPES[extname(target).toLowerCase()] ?? "application/octet-stream" });
      response.end(readFileSync(target));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolvePromise(`http://127.0.0.1:${port}`);
    });
  });
}

async function newPage() {
  const page = await browser.newPage();
  page.on("console", (message: any) => {
    if (message.type() === "error") consoleErrors.push(`${page.url()} :: ${message.text()}`);
  });
  page.on("requestfailed", (request: any) => {
    // A browser routinely aborts a srcset candidate it decided not to use, and
    // aborts in-flight image requests when the page navigates. Neither is a
    // broken asset: script/verify.ts separately proves every srcset target
    // exists in dist/. Only genuine failures are collected here.
    const error = request.failure()?.errorText ?? "";
    if (request.resourceType() === "image" && error.includes("ERR_ABORTED")) return;
    failedRequests.push(`${request.url()} :: ${error}`);
  });
  page.on("response", (response: any) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
  });
  return page;
}

/** Wait until the inventory script has replaced the server-rendered grid. */
async function waitForHydration(page: any) {
  await page.waitForSelector('[data-inventory-grid][data-hydrated="true"]', { timeout: 15_000 });
}

describe("inventory UI in a browser", { skip: availability.ok ? false : availability.reason }, () => {
  before(async () => {
    origin = await startServer();
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  });

  after(async () => {
    await browser?.close();
    server?.close();
  });

  test("a four-filter URL restores all four controls after a reload", async () => {
    const page = await newPage();
    const search = "?condition=used&color=black&make=club_car&feature=lifted";
    await page.goto(`${origin}/inventory/${search}`, { waitUntil: "networkidle" });
    await waitForHydration(page);

    // Every one of the four controls must come back checked.
    for (const [field, value] of [
      ["condition", "used"],
      ["color", "black"],
      ["make", "club_car"],
      ["feature", "lifted"],
    ]) {
      const selector = `input[data-filter-field="${field}"][data-filter-value="${value}"]`;
      const checked = await page.$eval(selector, (input: HTMLInputElement) => input.checked);
      assert.equal(checked, true, `${field}=${value} should be checked after reload`);
    }

    // Four chips are rendered, naming the four filters.
    const chips = await page.$$eval("[data-chip-field]", (nodes: Element[]) =>
      nodes.map((node) => node.getAttribute("data-chip-field")),
    );
    assert.deepEqual([...chips].sort(), ["color", "condition", "feature", "make"]);

    // And the results genuinely match: every card badged Used.
    const badges = await page.$$eval('[data-testid^="badge-condition-"]', (nodes: Element[]) =>
      nodes.map((node) => node.textContent?.trim()),
    );
    assert.ok(badges.length > 0, "expected at least one result");
    assert.ok(badges.every((badge) => badge === "Used"), `all badges should read Used, got ${[...new Set(badges)].join(",")}`);
    await page.close();
  });

  test("?condition=new never shows a used cart", async () => {
    const page = await newPage();
    await page.goto(`${origin}/inventory/?condition=new`, { waitUntil: "networkidle" });
    await waitForHydration(page);
    const badges = await page.$$eval('[data-testid^="badge-condition-"]', (nodes: Element[]) =>
      nodes.map((node) => node.textContent?.trim()),
    );
    assert.ok(badges.length > 0);
    assert.ok(badges.every((badge) => badge === "New"), `got ${[...new Set(badges)].join(",")}`);
    await page.close();
  });

  test("the prerendered /inventory/used/ route shows only used carts before any JS runs", async () => {
    const page = await newPage();
    // JavaScript disabled: this is the server-rendered HTML only.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await context.newPage();
    await staticPage.goto(`${origin}/inventory/used/`, { waitUntil: "domcontentloaded" });
    const badges = await staticPage.$$eval('[data-testid^="badge-condition-"]', (nodes: Element[]) =>
      nodes.map((node) => node.textContent?.trim()),
    );
    assert.ok(badges.length > 0, "the prerendered page must contain carts, not a shell");
    assert.ok(badges.every((badge) => badge === "Used"), `got ${[...new Set(badges)].join(",")}`);
    await context.close();
    await page.close();
  });

  test("selecting a filter writes the URL, and back/forward restores it", async () => {
    const page = await newPage();
    await page.goto(`${origin}/inventory/`, { waitUntil: "networkidle" });
    await waitForHydration(page);

    const total = await page.$$eval(".cart-card", (nodes: Element[]) => nodes.length);

    await page.click('input[data-filter-field="condition"][data-filter-value="used"]');
    await page.waitForFunction(() => window.location.search.includes("condition=used"), { timeout: 5000 });
    const afterFilter = await page.$$eval('[data-testid^="badge-condition-"]', (nodes: Element[]) =>
      nodes.map((node) => node.textContent?.trim()),
    );
    assert.ok(afterFilter.every((badge) => badge === "Used"));

    // Back: the filter comes off and the control unchecks.
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !window.location.search.includes("condition=used"), { timeout: 5000 });
    const uncheckedAfterBack = await page.$eval(
      'input[data-filter-field="condition"][data-filter-value="used"]',
      (input: HTMLInputElement) => input.checked,
    );
    assert.equal(uncheckedAfterBack, false, "the control must uncheck on back");
    assert.equal(await page.$$eval(".cart-card", (nodes: Element[]) => nodes.length), total);

    // Forward: it comes back.
    await page.goForward({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.location.search.includes("condition=used"), { timeout: 5000 });
    const recheckedAfterForward = await page.$eval(
      'input[data-filter-field="condition"][data-filter-value="used"]',
      (input: HTMLInputElement) => input.checked,
    );
    assert.equal(recheckedAfterForward, true, "the control must recheck on forward");
    await page.close();
  });

  test("filters survive a trip to a detail page and back", async () => {
    const page = await newPage();
    await page.goto(`${origin}/inventory/?condition=used&color=black`, { waitUntil: "networkidle" });
    await waitForHydration(page);

    const firstHref = await page.$eval(".cart-card__title a", (link: HTMLAnchorElement) => link.getAttribute("href"));
    await page.click(".cart-card__title a");
    await page.waitForURL((url: URL) => url.pathname.startsWith("/golfcart/"), { timeout: 10_000 });
    assert.ok(page.url().includes("/golfcart/"), `expected a detail page, got ${page.url()}`);

    await page.goBack({ waitUntil: "networkidle" });
    await waitForHydration(page);
    assert.ok(page.url().includes("condition=used"), `filters lost on back: ${page.url()}`);
    assert.ok(page.url().includes("color=black"), `colour lost on back: ${page.url()}`);
    const checked = await page.$eval(
      'input[data-filter-field="color"][data-filter-value="black"]',
      (input: HTMLInputElement) => input.checked,
    );
    assert.equal(checked, true, "the colour control must be restored on back");
    assert.ok(firstHref, "sanity: a card link existed");
    await page.close();
  });

  test("an unknown filter value is explained rather than returning an empty grid", async () => {
    const page = await newPage();
    await page.goto(`${origin}/inventory/?color=chartreuse`, { waitUntil: "networkidle" });
    await waitForHydration(page);
    const cards = await page.$$eval(".cart-card", (nodes: Element[]) => nodes.length);
    assert.ok(cards > 0, "an unknown value must not zero out the results");
    const note = await page.$('[data-testid="text-ignored-filters"]');
    assert.ok(note, "the ignored value should be called out on the page");
    await page.close();
  });

  test("clear all empties every filter", async () => {
    const page = await newPage();
    await page.goto(`${origin}/inventory/?condition=used&color=black&make=club_car`, { waitUntil: "networkidle" });
    await waitForHydration(page);
    await page.click('[data-testid="button-clear-all"]');
    await page.waitForFunction(() => !window.location.search.includes("condition"), { timeout: 5000 });
    const chips = await page.$$eval("[data-chip-field]", (nodes: Element[]) => nodes.length);
    assert.equal(chips, 0, "no chips should remain");
    await page.close();
  });

  test("facet counts are rendered and zero-count options are disabled", async () => {
    const page = await newPage();
    await page.goto(`${origin}/inventory/?fuel=gas`, { waitUntil: "networkidle" });
    await waitForHydration(page);
    const counts = await page.$$eval("[data-facet-field]", (nodes: Element[]) =>
      nodes.map((node) => ({
        field: node.getAttribute("data-facet-field"),
        value: node.getAttribute("data-facet-value"),
        count: Number(node.textContent),
        disabled: (node.closest("label")?.querySelector("input") as HTMLInputElement | null)?.disabled ?? false,
      })),
    );
    assert.ok(counts.length > 0, "facet counts should be rendered");
    for (const entry of counts) {
      if (entry.count === 0) {
        assert.equal(entry.disabled, true, `${entry.field}=${entry.value} has 0 matches and must be disabled`);
      }
    }
    await page.close();
  });

  test("a detail page and the home page load with no console errors and no failed requests", async () => {
    const page = await newPage();
    for (const path of ["/", "/inventory/", "/golf-carts-for-sale/"]) {
      await page.goto(`${origin}${path}`, { waitUntil: "networkidle" });
    }
    const firstCart = await page.$eval(".cart-card__title a", (link: HTMLAnchorElement) => link.getAttribute("href"));
    await page.goto(`${origin}${firstCart}`, { waitUntil: "networkidle" });
    await page.close();

    assert.deepEqual(consoleErrors, [], `console errors:\n${consoleErrors.join("\n")}`);
    assert.deepEqual(failedRequests, [], `failed requests:\n${failedRequests.join("\n")}`);
  });

  test("no request goes to a local API path", async () => {
    const page = await newPage();
    const requests: string[] = [];
    page.on("request", (request: any) => requests.push(request.url()));
    await page.goto(`${origin}/inventory/?condition=new`, { waitUntil: "networkidle" });
    await waitForHydration(page);

    const apiCalls = requests.filter((url) => /\/api\//.test(url));
    assert.deepEqual(apiCalls, [], `unexpected API calls: ${apiCalls.join(", ")}`);

    // The only data request is the static snapshot file.
    const dataCalls = requests.filter((url) => url.includes("/data/"));
    assert.ok(
      dataCalls.every((url) => url.endsWith(".json")),
      `data requests should be static JSON only: ${dataCalls.join(", ")}`,
    );
    await page.close();
  });

  test("images are served as WebP with srcset, not as originals", async () => {
    const page = await newPage();
    const imageRequests: string[] = [];
    page.on("request", (request: any) => {
      if (request.resourceType() === "image") imageRequests.push(request.url());
    });
    await page.goto(`${origin}/inventory/`, { waitUntil: "networkidle" });
    await waitForHydration(page);

    const cartImages = imageRequests.filter((url) => url.includes("/images/carts/"));
    assert.ok(cartImages.length > 0, "expected cart images to load");
    assert.ok(
      cartImages.every((url) => /\.(webp|avif)$/.test(url)),
      `every cart image should be WebP or AVIF: ${cartImages.filter((url) => !/\.(webp|avif)$/.test(url)).join(", ")}`,
    );
    assert.deepEqual(
      imageRequests.filter((url) => url.includes("s3.amazonaws.com")),
      [],
      "no original should be fetched from S3",
    );
    await page.close();
  });
});
