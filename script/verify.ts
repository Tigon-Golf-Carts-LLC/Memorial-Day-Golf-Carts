#!/usr/bin/env node
/**
 * Phase 11 — verify the built site.
 *
 * Runs the checks the brief asks for against dist/ as it actually is, and exits
 * non-zero on a real failure. Everything here reads the built output rather
 * than the source, so a renderer that silently stopped emitting something is
 * caught.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative, posix } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(root, "dist");
const BASE_PATH = (process.env.BASE_PATH || "/").replace(/\/*$/, "/");

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = [];
const record = (name: string, pass: boolean, detail = "") => checks.push({ name, pass, detail });

function walk(directory: string, out: string[] = []): string[] {
  for (const name of readdirSync(directory)) {
    const full = join(directory, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(DIST, full).split("\\").join("/"));
  }
  return out;
}

/** Resolve a site URL to the dist file that would serve it, or null. */
function fileFor(url: string, files: Set<string>): string | null {
  let pathname = url;
  if (/^https?:\/\//i.test(pathname)) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      return null;
    }
  }
  pathname = pathname.split("?")[0].split("#")[0];
  if (BASE_PATH !== "/" && pathname.startsWith(BASE_PATH)) pathname = `/${pathname.slice(BASE_PATH.length)}`;
  const clean = pathname.replace(/^\/+/, "");
  if (clean === "" ) return files.has("index.html") ? "index.html" : null;
  if (files.has(clean)) return clean;
  const index = posix.join(clean, "index.html");
  if (files.has(index)) return index;
  return null;
}

function main() {
  if (!existsSync(DIST)) {
    process.stderr.write("FATAL: dist/ does not exist. Run the build first.\n");
    process.exit(1);
  }

  const fileList = walk(DIST);
  const files = new Set(fileList);
  const htmlFiles = fileList.filter((file) => file.endsWith(".html"));

  process.stdout.write(`\n${"=".repeat(72)}\nVERIFY dist/ — ${fileList.length} files, ${htmlFiles.length} HTML pages\n${"=".repeat(72)}\n`);

  /* --- 1. required files ------------------------------------------------ */

  for (const required of ["index.html", "404.html", ".nojekyll", "sitemap.xml", "robots.txt", "CNAME", "data/inventory-index.json", "manifest.webmanifest", "llms.txt"]) {
    record(`dist/${required} exists`, files.has(required));
  }

  /* --- 2. no blank shells ---------------------------------------------- */

  // A prerendered page must already carry its content. An h1 and a body of
  // real length is the cheap proxy for "not a shell".
  let shells = 0;
  let missingH1 = 0;
  let multipleH1 = 0;
  let missingCanonical = 0;
  let missingDescription = 0;
  let missingJsonLd = 0;
  let longTitles = 0;
  let longDescriptions = 0;
  const noindexPages = new Set<string>();
  const canonicalOf = new Map<string, string>();

  for (const file of htmlFiles) {
    const html = readFileSync(resolve(DIST, file), "utf8");
    const h1s = html.match(/<h1[\s>]/g) ?? [];
    if (h1s.length === 0) missingH1 += 1;
    if (h1s.length > 1) multipleH1 += 1;
    if (html.length < 4000) shells += 1;

    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html);
    if (!canonical) missingCanonical += 1;
    else canonicalOf.set(file, canonical[1]);

    const description = /<meta name="description" content="([^"]*)"/.exec(html);
    if (!description || !description[1]) missingDescription += 1;
    else if (description[1].length > 155) longDescriptions += 1;

    const title = /<title>([^<]*)<\/title>/.exec(html);
    if (title && title[1].length > 60) longTitles += 1;

    if (!html.includes('application/ld+json')) missingJsonLd += 1;
    if (/<meta name="robots" content="noindex/.test(html)) noindexPages.add(file);
  }

  record("every page has exactly one <h1>", missingH1 === 0 && multipleH1 === 0, `${missingH1} missing, ${multipleH1} with more than one`);
  record("no page is a near-empty shell", shells === 0, `${shells} pages under 4 KB`);
  record("every page has a canonical", missingCanonical === 0, `${missingCanonical} missing`);
  record("every page has a meta description", missingDescription === 0, `${missingDescription} missing`);
  record("every title <= 60 chars", longTitles === 0, `${longTitles} over`);
  record("every description <= 155 chars", longDescriptions === 0, `${longDescriptions} over`);
  record("every page has JSON-LD", missingJsonLd === 0, `${missingJsonLd} missing`);

  /* --- 3. no same-origin API, no leaked secrets ------------------------ */

  const codeFiles = fileList.filter((file) => /\.(js|css|html|json|webmanifest)$/.test(file));
  const forbidden: Array<[string, RegExp]> = [
    ["localhost", /localhost/i],
    ["/api/", /["'`(\s]\/api\//],
    ["replit", /replit/i],
    ["127.0.0.1", /127\.0\.0\.1/],
    ["FORMSPREE_FORM_ID", /FORMSPREE_FORM_ID/],
    ["DMS_BASE_URL literal", /DMS_BASE_URL/],
    ["api.tigondms.com", /api\.tigondms\.com/],
    ["process.env", /process\.env\./],
  ];
  const hits: Array<{ needle: string; file: string; sample: string }> = [];
  for (const file of codeFiles) {
    const text = readFileSync(resolve(DIST, file), "utf8");
    for (const [needle, pattern] of forbidden) {
      const match = pattern.exec(text);
      if (match) hits.push({ needle, file, sample: text.slice(Math.max(0, match.index - 40), match.index + 60).replace(/\s+/g, " ") });
    }
  }
  record("no forbidden strings in the build", hits.length === 0, `${hits.length} hits`);

  // fetch() must never point at a same-origin API path.
  const jsFiles = fileList.filter((file) => file.endsWith(".js"));
  let apiFetches = 0;
  for (const file of jsFiles) {
    const text = readFileSync(resolve(DIST, file), "utf8");
    for (const match of text.matchAll(/fetch\(\s*["'`]([^"'`]+)/g)) {
      if (/^\/?api\//.test(match[1]) || /\/api\//.test(match[1])) apiFetches += 1;
    }
  }
  record("no fetch() points at a same-origin API", apiFetches === 0, `${apiFetches} found`);

  /* --- 4. internal links and images resolve ---------------------------- */

  const brokenLinks: Array<{ from: string; href: string }> = [];
  const brokenImages: Array<{ from: string; src: string }> = [];
  const seenLinks = new Set<string>();
  const seenImages = new Set<string>();

  for (const file of htmlFiles) {
    const html = readFileSync(resolve(DIST, file), "utf8");

    for (const match of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
      const href = match[1];
      // Skip external, anchors, and non-http schemes.
      if (/^(https?:\/\/|\/\/|#|mailto:|tel:|data:|javascript:)/i.test(href)) continue;
      const key = `${href}`;
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      if (!fileFor(href, files)) brokenLinks.push({ from: file, href });
    }

    for (const match of html.matchAll(/<(?:img|source)\b[^>]*\s(?:src|srcset)="([^"]+)"/g)) {
      // srcset carries several candidates with width descriptors.
      for (const candidate of match[1].split(",")) {
        const src = candidate.trim().split(/\s+/)[0];
        if (!src || /^(https?:\/\/|\/\/|data:)/i.test(src)) continue;
        if (seenImages.has(src)) continue;
        seenImages.add(src);
        if (!fileFor(src, files)) brokenImages.push({ from: file, src });
      }
    }
  }
  record("no broken internal links", brokenLinks.length === 0, `${brokenLinks.length} of ${seenLinks.size} checked`);
  record("no broken images", brokenImages.length === 0, `${brokenImages.length} of ${seenImages.size} checked`);

  /* --- 5. sitemap integrity -------------------------------------------- */

  const sitemap = files.has("sitemap.xml") ? readFileSync(resolve(DIST, "sitemap.xml"), "utf8") : "";
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const unresolved = sitemapUrls.filter((url) => !fileFor(url, files));
  record("every sitemap URL resolves to a file", unresolved.length === 0, `${unresolved.length} of ${sitemapUrls.length} unresolved`);

  const noindexInSitemap = sitemapUrls.filter((url) => {
    const file = fileFor(url, files);
    return file ? noindexPages.has(file) : false;
  });
  record("no noindex page is in the sitemap", noindexInSitemap.length === 0, `${noindexInSitemap.length} found`);

  // A canonicalized alias must not be in the sitemap either.
  const aliasInSitemap = sitemapUrls.filter((url) => {
    const file = fileFor(url, files);
    if (!file) return false;
    const canonical = canonicalOf.get(file);
    if (!canonical) return false;
    return fileFor(canonical, files) !== file;
  });
  record("every sitemap URL is self-canonical", aliasInSitemap.length === 0, `${aliasInSitemap.length} point elsewhere`);

  const sitemapImages = [...sitemap.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((match) => match[1]);
  const missingSitemapImages = sitemapImages.filter((url) => !fileFor(url, files));
  record("every sitemap image resolves", missingSitemapImages.length === 0, `${missingSitemapImages.length} of ${sitemapImages.length} missing`);

  /* --- 6. robots ------------------------------------------------------- */

  const robots = files.has("robots.txt") ? readFileSync(resolve(DIST, "robots.txt"), "utf8") : "";
  record("robots.txt references an absolute sitemap URL", /Sitemap:\s*https?:\/\/\S+/.test(robots));
  for (const agent of ["GPTBot", "PerplexityBot", "ClaudeBot", "Google-Extended"]) {
    record(`robots.txt allows ${agent}`, new RegExp(`User-agent:\\s*${agent}\\s*\\nAllow:\\s*/`, "i").test(robots));
  }

  /* --- 7. images are served as WebP/AVIF with srcset ------------------- */

  const home = readFileSync(resolve(DIST, "index.html"), "utf8");
  const homeImgs = [...home.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  const cartImgs = homeImgs.filter((tag) => tag.includes("images/carts/"));
  record("cart images on the home page use srcset", cartImgs.length > 0 && cartImgs.every((tag) => tag.includes("srcset=")), `${cartImgs.length} cart images`);
  record("cart images are WebP", cartImgs.every((tag) => /\.webp/.test(tag)), "");
  // AVIF ships on the vehicle-detail hero, where the decode cost is paid once.
  // Grid cards are deliberately plain WebP so the LCP candidate has no source
  // list to resolve first.
  const detailSample = htmlFiles.find((file) => file.startsWith("golfcart/"));
  const detailHtml = detailSample ? readFileSync(resolve(DIST, detailSample), "utf8") : "";
  record("vehicle detail page emits an AVIF source", /type="image\/avif"/.test(detailHtml), detailSample ?? "no detail page");
  record("AVIF derivatives exist in the build", fileList.some((file) => file.endsWith(".avif")), `${fileList.filter((file) => file.endsWith(".avif")).length} files`);
  record("no original JPEG from S3 on the home page", !/s3\.amazonaws\.com/.test(home.replace(/<link rel="preconnect"[^>]*>/g, "")), "");

  const allImgs: string[] = [];
  for (const file of htmlFiles) {
    allImgs.push(...(readFileSync(resolve(DIST, file), "utf8").match(/<img\b[^>]*>/g) ?? []));
  }
  const noDimensions = allImgs.filter((tag) => !(tag.includes("width=") && tag.includes("height=")));
  record("every <img> declares width and height", noDimensions.length === 0, `${noDimensions.length} of ${allImgs.length} missing`);
  const noAlt = allImgs.filter((tag) => !/\salt="[^"]/.test(tag));
  record("every <img> has non-empty alt text", noAlt.length === 0, `${noAlt.length} of ${allImgs.length} missing`);
  const genericAlt = allImgs.filter((tag) => /alt="(image|photo|picture|img)?\d*\.?(jpg|png|jpeg)?"/i.test(tag));
  record("no filename-style alt text", genericAlt.length === 0, `${genericAlt.length} found`);

  /* --- 8. base path honoured ------------------------------------------- */

  if (BASE_PATH !== "/") {
    let unprefixed = 0;
    for (const file of htmlFiles) {
      const html = readFileSync(resolve(DIST, file), "utf8");
      for (const match of html.matchAll(/\s(?:href|src)="(\/[^"/][^"]*)"/g)) {
        if (!match[1].startsWith(BASE_PATH)) unprefixed += 1;
      }
    }
    record(`every root-relative URL honours ${BASE_PATH}`, unprefixed === 0, `${unprefixed} unprefixed`);
  } else {
    record("base path is / (no prefix required)", true, "");
  }

  /* --- 9. JSON-LD validity -------------------------------------------- */

  const sampleByKind: Record<string, string> = {
    home: "index.html",
    pillar: "golf-carts-for-sale/index.html",
    listing: "inventory/new/index.html",
    vehicle: htmlFiles.find((file) => file.startsWith("golfcart/")) ?? "",
    brand: htmlFiles.find((file) => /^brands\/[^/]+\/index\.html$/.test(file)) ?? "",
    location: htmlFiles.find((file) => /^locations\/[^/]+\/index\.html$/.test(file)) ?? "",
    guide: htmlFiles.find((file) => file.startsWith("guides/") && file !== "guides/index.html") ?? "",
    content: "financing/index.html",
  };

  const schemaReport: Array<{ kind: string; file: string; types: string[]; errors: string[] }> = [];
  for (const [kind, file] of Object.entries(sampleByKind)) {
    if (!file || !files.has(file)) {
      record(`JSON-LD sample for ${kind}`, false, `no page found (${file || "none"})`);
      continue;
    }
    const html = readFileSync(resolve(DIST, file), "utf8");
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    const errors: string[] = [];
    const types: string[] = [];

    for (const block of blocks) {
      try {
        const parsed = JSON.parse(block[1]);
        const nodes = parsed["@graph"] ?? [parsed];
        if (!parsed["@context"]) errors.push("missing @context");
        for (const node of nodes) {
          const type = node["@type"];
          types.push(...(Array.isArray(type) ? type : [type]));
          if (!type) errors.push("node without @type");
        }
      } catch (error) {
        errors.push(`invalid JSON: ${(error as Error).message}`);
      }
    }
    if (!blocks.length) errors.push("no JSON-LD block");
    schemaReport.push({ kind, file, types: [...new Set(types)], errors });
    record(`JSON-LD parses on the ${kind} page`, errors.length === 0, errors.join("; ") || `${types.length} types`);
  }

  // itemCondition must agree with the page's own condition badge.
  let conditionMismatch = 0;
  for (const file of htmlFiles.filter((entry) => entry.startsWith("golfcart/"))) {
    const html = readFileSync(resolve(DIST, file), "utf8");
    const badgeUsed = /data-testid="badge-condition"[^>]*>Used</.test(html);
    const schemaUsed = /schema\.org\/UsedCondition/.test(html);
    const schemaNew = /schema\.org\/NewCondition/.test(html);
    if (badgeUsed !== schemaUsed || badgeUsed === schemaNew) conditionMismatch += 1;
  }
  record("itemCondition matches the visible condition on every cart page", conditionMismatch === 0, `${conditionMismatch} mismatches`);

  /* --- 10. phone consistency (Phase 8) -------------------------------- */

  const phoneDigits = "8444562228";
  let missingPhone = 0;
  let missingTel = 0;
  for (const file of htmlFiles) {
    const html = readFileSync(resolve(DIST, file), "utf8");
    if (!html.includes(`tel:+1${phoneDigits}`)) missingTel += 1;
    if (!html.includes("844-456-2228")) missingPhone += 1;
  }
  record("every page carries the tel: link", missingTel === 0, `${missingTel} missing`);
  record("every page shows the phone number as text", missingPhone === 0, `${missingPhone} missing`);
  record("phone in schema matches the tel: href", /"telephone":\s*"\+18444562228"/.test(home), "");
  record("sticky mobile call button present", /class="sticky-call"/.test(home), "");

  /* --- 11. forms ------------------------------------------------------- */

  const contact = files.has("contact/index.html") ? readFileSync(resolve(DIST, "contact/index.html"), "utf8") : "";
  const formActions = [...contact.matchAll(/<form\b[^>]*\saction="([^"]+)"/g)].map((match) => match[1]);
  const sameOriginForm = formActions.filter((action) => !/^https?:\/\//i.test(action));
  record("no form posts to a same-origin endpoint", sameOriginForm.length === 0, formActions.length ? formActions.join(", ") : "no form (mailto fallback)");

  /* --- report --------------------------------------------------------- */

  process.stdout.write("\n");
  const width = Math.max(...checks.map((check) => check.name.length));
  for (const check of checks) {
    process.stdout.write(`  ${check.pass ? "PASS" : "FAIL"}  ${check.name.padEnd(width)}  ${check.detail}\n`);
  }

  if (schemaReport.length) {
    process.stdout.write(`\n${"=".repeat(72)}\nJSON-LD TYPES BY PAGE\n${"=".repeat(72)}\n`);
    for (const entry of schemaReport) {
      process.stdout.write(`  ${entry.kind.padEnd(10)} ${entry.file}\n    ${entry.types.join(", ")}\n`);
    }
  }

  const failed = checks.filter((check) => !check.pass);
  process.stdout.write(`\n${"=".repeat(72)}\n${checks.length - failed.length}/${checks.length} checks passed\n${"=".repeat(72)}\n`);

  if (failed.length) {
    if (hits.length) {
      process.stdout.write(`\nForbidden-string hits (first 15):\n`);
      for (const hit of hits.slice(0, 15)) process.stdout.write(`  [${hit.needle}] ${hit.file}\n    …${hit.sample}…\n`);
    }
    if (brokenLinks.length) {
      process.stdout.write(`\nBroken links (first 20):\n`);
      for (const link of brokenLinks.slice(0, 20)) process.stdout.write(`  ${link.href}  (from ${link.from})\n`);
    }
    if (brokenImages.length) {
      process.stdout.write(`\nBroken images (first 20):\n`);
      for (const image of brokenImages.slice(0, 20)) process.stdout.write(`  ${image.src}  (from ${image.from})\n`);
    }
    if (unresolved.length) {
      process.stdout.write(`\nUnresolved sitemap URLs (first 20):\n`);
      for (const url of unresolved.slice(0, 20)) process.stdout.write(`  ${url}\n`);
    }
    process.exit(1);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
