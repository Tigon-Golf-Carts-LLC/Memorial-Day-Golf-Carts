/**
 * The floating contact widget, checked in a real browser.
 *
 * The real DMS chat plugin is replaced with a small stand-in that renders the
 * same shadow-root structure (#chat-bubble toggles #chat-popup, #close-popup,
 * #chat-unread-badge), so these tests prove the wiring without depending on
 * the plugin or its API. No lead is ever posted.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, extname, normalize } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(root, "dist");

async function availability(): Promise<string> {
  if (!existsSync(join(DIST, "index.html"))) return "dist/ not built";
  try {
    const { chromium } = await import("playwright");
    return existsSync(chromium.executablePath()) ? "" : "no Playwright browser installed";
  } catch {
    return "playwright is not installed";
  }
}

const skipReason = await availability();
if (skipReason) process.stderr.write(`\nSkipping the contact-widget tests: ${skipReason}\n\n`);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

/** Mirrors the real plugin's DOM and toggle behaviour. */
const FAKE_PLUGIN = `(function () {
  const host = document.createElement("div");
  host.id = "chat-plugin-host";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    '<style>.hidden{display:none}#c{position:fixed;bottom:20px;right:20px}</style>' +
    '<div id="c"><div id="chat-bubble" style="width:64px;height:64px">chat' +
    '<span id="chat-unread-badge" class="hidden"></span></div>' +
    '<span id="chat-callout">Chat With Us</span>' +
    '<div id="chat-popup" class="hidden"><button id="close-popup">x</button></div></div>';
  const popup = root.getElementById("chat-popup");
  const toggle = () => popup.classList.toggle("hidden");
  root.getElementById("chat-bubble").addEventListener("click", toggle);
  root.getElementById("close-popup").addEventListener("click", toggle);
  window.__fakeChat = { root, unread(n) {
    const badge = root.getElementById("chat-unread-badge");
    badge.textContent = n ? String(n) : "";
    badge.classList.toggle("hidden", !n);
  } };
})();`;

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

async function openPage(options: { plugin?: string; viewport?: { width: number; height: number } } = {}) {
  const page = await browser.newPage({ viewport: options.viewport ?? { width: 1280, height: 800 } });
  await page.route("**/chat-plugin/chat-plugin.js", (route: any) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: options.plugin ?? FAKE_PLUGIN }),
  );
  await page.route("https://tigoniot.com/hooks/**", (route: any) => route.abort());
  await page.goto(`${origin}/`, { waitUntil: "load" });
  return page;
}

const pluginBubbleVisible = (page: any) =>
  page.evaluate(() => {
    const bubble = document.getElementById("chat-plugin-host")?.shadowRoot?.getElementById("chat-bubble");
    return !!bubble && getComputedStyle(bubble).display !== "none";
  });
const chatPopupOpen = (page: any) =>
  page.evaluate(() =>
    !document.getElementById("chat-plugin-host")!.shadowRoot!.getElementById("chat-popup")!.classList.contains("hidden"),
  );

describe("floating contact widget in a browser", { skip: skipReason || false }, () => {
  before(async () => {
    origin = await startServer();
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  });

  after(async () => {
    await browser?.close();
    server?.close();
  });

  test("one bubble opens a menu with the three labelled options; the old floating buttons are gone", async () => {
    const page = await openPage();
    await page.waitForFunction(() => document.getElementById("chat-plugin-host"));
    assert.equal(await page.locator(".sticky-call").count(), 0);
    assert.equal(await pluginBubbleVisible(page), false, "the chat plugin's own bubble must be hidden");

    const toggle = page.locator('[data-testid="button-contact-widget"]');
    const panel = page.locator('[data-testid="panel-contact-widget"]');
    assert.equal(await panel.isVisible(), false);
    await toggle.click();
    assert.equal(await panel.isVisible(), true);
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");

    const text = await panel.innerText();
    for (const expected of [
      "Send Us a Message", "Submit a contact form, for us to contact you.",
      "Direct Message", "Start a direct message with customer service.",
      "Call Now", "Call us directly.",
    ]) assert.ok(text.includes(expected), `menu shows "${expected}"`);
    assert.equal(
      await page.locator('[data-testid="link-contact-call"]').getAttribute("href"),
      "tel:+18444562228",
    );

    await page.locator('[data-testid="button-contact-widget-close"]').click();
    assert.equal(await panel.isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "button-contact-widget");
    await page.close();
  });

  test("keyboard: Enter opens, arrows move, Escape closes and returns focus", async () => {
    const page = await openPage();
    await page.locator('[data-testid="button-contact-widget"]').focus();
    await page.keyboard.press("Enter");
    const focused = () => page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
    assert.equal(await focused(), "button-contact-message");
    await page.keyboard.press("ArrowDown");
    assert.equal(await focused(), "button-contact-chat");
    await page.keyboard.press("ArrowDown");
    assert.equal(await focused(), "link-contact-call");
    await page.keyboard.press("ArrowDown");
    assert.equal(await focused(), "button-contact-message");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator('[data-testid="panel-contact-widget"]').isVisible(), false);
    assert.equal(await focused(), "button-contact-widget");
    await page.close();
  });

  test("Send Us a Message opens the existing lead-form modal", async () => {
    const page = await openPage();
    await page.locator('[data-testid="button-contact-widget"]').click();
    await page.locator('[data-testid="button-contact-message"]').click();
    const dialog = page.locator('[data-testid="dialog-lead"]');
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await page.locator('[data-testid="panel-contact-widget"]').isVisible(), false);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), false);
    await page.close();
  });

  test("Direct Message opens the chat; the bubble then closes it; unread count is mirrored", async () => {
    const page = await openPage();
    await page.waitForFunction(() => document.getElementById("chat-plugin-host"));
    const toggle = page.locator('[data-testid="button-contact-widget"]');
    await toggle.click();
    await page.locator('[data-testid="button-contact-chat"]').click();
    assert.equal(await chatPopupOpen(page), true);
    assert.equal(await toggle.getAttribute("aria-label"), "Close chat");
    await toggle.click();
    assert.equal(await chatPopupOpen(page), false);
    assert.equal(await toggle.getAttribute("aria-label"), "Contact us");

    await page.evaluate(() => (window as any).__fakeChat.unread(2));
    const badge = page.locator("[data-contact-badge]");
    await page.waitForFunction(() => !document.querySelector<HTMLElement>("[data-contact-badge]")!.hidden);
    assert.equal(await badge.innerText(), "2");
    assert.match((await toggle.getAttribute("aria-label")) ?? "", /2 unread/);
    await page.close();
  });

  test("if the chat never loads, Direct Message falls back to the contact form", async () => {
    const page = await openPage({ plugin: "/* blocked */" });
    await page.locator('[data-testid="button-contact-widget"]').click();
    await page.locator('[data-testid="button-contact-chat"]').click();
    await page.locator('[data-testid="dialog-lead"]').waitFor({ state: "visible", timeout: 10_000 });
    await page.close();
  });

  test("on a phone the menu fits the screen with large tap targets", async () => {
    const page = await openPage({ viewport: { width: 375, height: 667 } });
    await page.locator('[data-testid="button-contact-widget"]').click();
    // Measure after the open animation, which briefly scales the panel.
    await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
    const box = await page.locator('[data-testid="panel-contact-widget"]').boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 375, "panel within the viewport");
    for (const id of ["button-contact-message", "button-contact-chat", "link-contact-call", "button-contact-widget-close"]) {
      const target = await page.locator(`[data-testid="${id}"]`).boundingBox();
      assert.ok(target && target.height >= 44 && target.width >= 44, `${id} is at least 44px`);
    }
    await page.close();
  });
});
