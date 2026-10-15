/**
 * TIGON IOT lead forms, checked in a real browser.
 *
 * The webhook is never actually called: every POST to tigoniot.com/hooks/ is
 * intercepted, inspected and answered here, so no test lead reaches TIGON.
 *
 * Skipped when dist/ was built without TIGON_WEBHOOK_KEY (the forms then render
 * as a call/email fallback) or when no Playwright browser is installed.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, extname, normalize } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(root, "dist");
const contactFile = join(DIST, "contact", "index.html");

async function availability(): Promise<string> {
  if (!existsSync(contactFile)) return "dist/ not built";
  if (!readFileSync(contactFile, "utf8").includes("data-lead-form")) {
    return "dist/ built without TIGON_WEBHOOK_KEY — lead forms are the fallback";
  }
  try {
    const { chromium } = await import("playwright");
    return existsSync(chromium.executablePath()) ? "" : "no Playwright browser installed";
  } catch {
    return "playwright is not installed";
  }
}

const skipReason = await availability();
if (skipReason) process.stderr.write(`\nSkipping the lead-form tests: ${skipReason}\n\n`);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

let server: Server;
let origin = "";
let browser: any;

function startServer(): Promise<string> {
  return new Promise((done) => {
    server = createServer((request, response) => {
      const pathname = decodeURIComponent((request.url ?? "/").split("?")[0]);
      let target = join(DIST, normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
      if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
      if (!existsSync(target) || !statSync(target).isFile()) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      response.writeHead(200, { "Content-Type": TYPES[extname(target)] ?? "application/octet-stream" });
      response.end(readFileSync(target));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      done(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
    });
  });
}

/** Intercept the webhook; returns the captured request bodies. */
async function interceptWebhook(page: any, reply: { status: number; body: unknown }) {
  const posts: string[] = [];
  await page.route("https://tigoniot.com/hooks/**", async (route: any) => {
    posts.push(route.request().postData() ?? "");
    await route.fulfill({
      status: reply.status,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(reply.body),
    });
  });
  return posts;
}

/** The value of one multipart field in a captured body. */
function part(body: string, name: string): string | null {
  const match = new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`).exec(body);
  return match ? match[1] : null;
}

describe("TIGON lead forms in a browser", { skip: skipReason || false }, () => {
  before(async () => {
    origin = await startServer();
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  });

  after(async () => {
    await browser?.close();
    server?.close();
  });

  test("contact form validates, then sends every field with tracking", async () => {
    const page = await browser.newPage();
    const posts = await interceptWebhook(page, { status: 200, body: { ok: true, id: "lead_1" } });
    await page.goto(`${origin}/contact/?utm_source=google&utm_medium=cpc&utm_campaign=spring-sale&gclid=abc123`);
    const form = page.locator('[data-testid="form-contact"]');

    await form.locator('button[type="submit"]').click();
    await page.waitForSelector('[data-testid="form-contact"] .lead-form__error');
    assert.equal(posts.length, 0, "an invalid form must not be sent");

    await form.locator('[name="first_name"]').fill("Jane");
    await form.locator('[name="last_name"]').fill("Sample");
    await form.locator('[name="email"]').fill("not-an-email");
    await form.locator('[name="phone1"]').fill("555 010");
    await form.locator('button[type="submit"]').click();
    const errors = await form.locator(".lead-form__error").allTextContents();
    assert.ok(errors.some((text: string) => /valid email/.test(text)), errors.join(" | "));
    assert.ok(errors.some((text: string) => /10 digits/.test(text)), errors.join(" | "));
    assert.equal(posts.length, 0);

    await form.locator('[name="email"]').fill("jane.sample@example.com");
    await form.locator('[name="phone1"]').fill("(555) 010-2000");
    await form.locator('[name="zip_code"]').fill("19104");
    await form.locator('[name="brand"]').fill("TIGON");
    await form.locator('[name="model"]').fill("Tigon Blaze 4");
    await form.locator('[name="comments"]').fill("Test lead — please ignore");
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="form-contact"] [data-lead-status]')?.getAttribute("data-state") === "ok",
    );

    assert.equal(posts.length, 1);
    const body = posts[0];
    assert.equal(part(body, "form_name"), "Contact form");
    assert.equal(part(body, "first_name"), "Jane");
    assert.equal(part(body, "phone1"), "(555) 010-2000");
    assert.equal(part(body, "utm_source"), "google");
    assert.equal(part(body, "utm_campaign"), "spring-sale");
    assert.equal(part(body, "gclid"), "abc123");
    assert.match(part(body, "url") ?? "", /\/contact\/\?utm_source=google/);
    assert.equal(part(body, "website"), "", "the spam trap is sent empty");
    assert.equal(part(body, "image_1"), null, "empty photo inputs are left out");
    assert.equal(part(body, "user_ip"), null);
    assert.match(await form.locator("[data-lead-status]").textContent(), /Thank you/);
    await page.close();
  });

  test("first-touch UTMs survive to a later page; the modal is on it", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const posts = await interceptWebhook(page, { status: 200, body: { ok: true } });
    await page.goto(`${origin}/?utm_source=facebook&utm_medium=social`);
    await page.goto(`${origin}/financing/?utm_source=later`);
    await page.locator('[data-testid="button-header-quote"]').click();
    const form = page.locator('[data-testid="form-lead-modal-form"]');
    await form.locator('[name="first_name"]').fill("Jane");
    await form.locator('[name="last_name"]').fill("Sample");
    await form.locator('[name="email"]').fill("jane@example.com");
    await form.locator('[name="phone1"]').fill("5550102000");
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector("#lead-modal-form [data-lead-status]")?.getAttribute("data-state") === "ok");
    assert.equal(part(posts[0], "utm_source"), "facebook");
    assert.equal(part(posts[0], "utm_medium"), "social");
    await context.close();
  });

  test("a cart's Ask button pre-fills the modal; 429 asks the visitor to wait", async () => {
    const page = await browser.newPage();
    const posts = await interceptWebhook(page, { status: 429, body: { ok: false, error: "rate limited" } });
    await page.goto(`${origin}/inventory/`);
    const ask = page.locator('[data-testid^="button-ask-"]').first();
    const sku = await ask.getAttribute("data-lead-sku");
    const brand = await ask.getAttribute("data-lead-brand");
    await ask.click();
    const form = page.locator('[data-testid="form-lead-modal-form"]');
    assert.equal(await form.locator('[name="sku_number"]').inputValue(), sku);
    assert.equal(await form.locator('[name="brand"]').inputValue(), brand);
    assert.match(await form.locator("[data-lead-about]").textContent(), /Asking about/);

    await form.locator('[name="first_name"]').fill("Jane");
    await form.locator('[name="last_name"]').fill("Sample");
    await form.locator('[name="email"]').fill("jane@example.com");
    await form.locator('[name="phone1"]').fill("5550102000");
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector("#lead-modal-form [data-lead-status]")?.getAttribute("data-state") === "error");
    assert.match(await form.locator("[data-lead-status]").textContent(), /wait a minute/);
    assert.equal(part(posts[0], "sku_number"), sku);
    assert.equal(await form.locator('button[type="submit"]').isDisabled(), false, "the button is re-enabled");
    await page.close();
  });

  test("a vehicle page pre-fills brand, model, VIN and stock # read-only", async () => {
    const page = await browser.newPage();
    await page.goto(`${origin}/inventory/`);
    const href = await page.locator(".cart-card__title a").first().getAttribute("href");
    await page.goto(`${origin}${href}`);
    const form = page.locator('[data-testid="form-vehicle-form"]');
    assert.ok(await form.locator('[name="sku_number"]').inputValue());
    assert.ok(await form.locator('[name="brand"]').getAttribute("readonly") !== null);
    assert.ok(await page.locator('[data-testid="link-vehicle-financing"]').isVisible());
    await page.close();
  });
});
