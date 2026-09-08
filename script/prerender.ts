#!/usr/bin/env node
/**
 * Phase 4 — prerender every route to a real index.html.
 *
 * Runs after `vite build`, reads Vite's manifest to find the hashed CSS and JS
 * bundles, and writes dist/<route>/index.html for every entry in the route
 * table. That means:
 *
 *   - every URL is directly linkable and crawlable
 *   - no route renders a blank shell before hydration; the HTML already
 *     contains the carts, the copy and the schema
 *   - dist/404.html exists so a deep link that misses still resolves
 *   - dist/.nojekyll ships so files beginning with _ are served
 *
 * Client-side routing is still live: the inventory browser uses the History API
 * (never a hash) to keep the URL in step with the filters.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

import { site } from "../src/config/site.ts";
import { withBase, isoStamp } from "./lib/util.ts";
import { seoWarnings } from "./lib/layout.ts";
import { buildRouteTable, type RouteEntry } from "./lib/route-table.ts";
import { renderListingPage, pickFaq, PAGE_SIZE, type Snapshot } from "./pages/inventory.ts";
import { renderVehiclePage } from "./pages/vehicle.ts";
import { renderHomePage, renderEventPage, renderPillarPage } from "./pages/home.ts";
import { renderBrandsIndex, renderBrandPage, renderModelPage, brandSlug } from "./pages/brands.ts";
import { renderLocationsIndex, renderLocationPage } from "./pages/locations.ts";
import {
  renderFinancingPage, renderAboutPage, renderContactPage, renderServicePage,
  renderTradeInPage, renderDeliveryPage, renderFaqPage, renderGuidesIndex,
  renderGuidePage, renderHtmlSitemap, renderLegalPage, renderNotFoundPage,
} from "./pages/content.ts";
import { LISTING_ROUTES } from "./lib/routes.ts";
import { buildVocabulary, type FilterableCart } from "../src/lib/filters.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(root, "dist");
const SNAPSHOT = resolve(root, "src/data/snapshot.json");

let written = 0;
const paths: string[] = [];

/** Write an HTML page at a clean URL: "/foo/" becomes dist/foo/index.html. */
function emitPage(path: string, html: string): void {
  const relative =
    path === "/" ? "index.html" : path.endsWith(".html") ? path.replace(/^\//, "") : `${path.replace(/^\/|\/$/g, "")}/index.html`;
  const target = resolve(DIST, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html, "utf8");
  written += 1;
  paths.push(path);
}

/**
 * Resolve Vite's hashed asset filenames.
 *
 * The layout emits `__CSS__`, `__JS_SITE__` and `__JS_INVENTORY__` placeholders
 * rather than hardcoded paths, which is how Phase 5 is satisfied: the real
 * paths are base-path-prefixed here, in one place.
 */
interface Assets {
  css: string;
  site: string;
  inventory: string;
}

function resolveAssets(): Assets {
  const manifestPath = resolve(DIST, ".vite/manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Vite manifest not found at dist/.vite/manifest.json.\n` +
        `Run \`vite build\` before prerendering (npm run build does this in order).`,
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    { file: string; css?: string[]; isEntry?: boolean; name?: string }
  >;

  const entryFor = (needle: string) => {
    const key = Object.keys(manifest).find((name) => name.endsWith(needle));
    if (!key) throw new Error(`No Vite manifest entry ending in "${needle}". Entries: ${Object.keys(manifest).join(", ")}`);
    return manifest[key];
  };

  const siteEntry = entryFor("src/client/site.ts");
  const inventoryEntry = entryFor("src/client/inventory.ts");

  // With cssCodeSplit disabled Vite emits one stylesheet under its own
  // "style.css" manifest key rather than attaching a `css` array to the JS
  // entry that imported it. Both shapes are accepted so the config can change
  // without breaking the prerender.
  const css =
    siteEntry.css?.[0] ??
    Object.values(manifest).flatMap((entry) => entry.css ?? [])[0] ??
    Object.values(manifest).find((entry) => entry.file?.endsWith(".css"))?.file;
  if (!css) {
    throw new Error(
      "No CSS emitted by Vite; expected src/styles/site.css to be bundled. " +
        `Manifest keys: ${Object.keys(manifest).join(", ")}`,
    );
  }

  return {
    css: withBase(css),
    site: withBase(siteEntry.file),
    inventory: withBase(inventoryEntry.file),
  };
}

/** Substitute the asset placeholders the layout left behind. */
function inject(html: string, assets: Assets): string {
  return html
    .replaceAll("__CSS__", assets.css)
    .replaceAll("__JS_SITE__", assets.site)
    .replaceAll("__JS_INVENTORY__", assets.inventory);
}

/**
 * Conservative HTML minification.
 *
 * Only two things are removed: comments, and the leading indentation on each
 * line. Whitespace *between* elements is reduced to a single newline rather
 * than eliminated, so an inline context that relied on a space between two
 * elements still has one — collapsing `>\n<` to `><` would silently run
 * adjacent inline elements together, and the saving over gzip is negligible.
 *
 * `<pre>` and `<textarea>` are absent from these templates, but the guard is
 * cheap and stops a future one from being mangled.
 */
function minify(html: string): string {
  const protectedBlocks: string[] = [];
  const withPlaceholders = html.replace(/<(pre|textarea)\b[\s\S]*?<\/\1>/gi, (match) => {
    protectedBlocks.push(match);
    return `\u0000PROTECTED${protectedBlocks.length - 1}\u0000`;
  });

  const minified = withPlaceholders
    // HTML comments. Not conditional comments: none are used.
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, "")
    // Leading indentation on every line.
    .replace(/^[ \t]+/gm, "")
    // Runs of blank lines.
    .replace(/\n{2,}/g, "\n")
    .trim();

  return minified.replace(/\u0000PROTECTED(\d+)\u0000/g, (_, index) => protectedBlocks[Number(index)]);
}

/* ------------------------------------------------------------- renderers --- */

function listingOptionsFor(entry: RouteEntry, snapshot: Snapshot, vocab: ReturnType<typeof buildVocabulary>) {
  const route = entry.route!;
  return {
    snapshot,
    vocab,
    path: route.path,
    locked: route.locked,
    h1: route.h1,
    title: route.title,
    description: route.description,
    question: route.question,
    answer: route.answer,
    copy: route.copy,
    keywords: route.keywords,
    faqTopics: route.faqTopics,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: "/golf-carts-for-sale/", label: "Golf Carts for Sale" },
      ...(route.path === "/inventory/" ? [] : [{ href: "/inventory/", label: "Inventory" }]),
      { href: route.path, label: route.h1 },
    ],
    related: LISTING_ROUTES.filter((other) => other.path !== route.path)
      .slice(0, 10)
      .map((other) => ({ href: other.path, label: other.h1 })),
    relatedHeading: "Other golf cart categories",
    canonicalTo: route.canonicalTo,
    page: entry.page,
  };
}

function renderRoute(entry: RouteEntry, snapshot: Snapshot, vocab: ReturnType<typeof buildVocabulary>): string {
  switch (entry.kind) {
    case "home":
      return renderHomePage(snapshot);
    case "pillar":
      return renderPillarPage(snapshot);
    case "event":
      return renderEventPage(snapshot);

    case "listing":
    case "listing-page":
    case "listing-alias":
      return renderListingPage(listingOptionsFor(entry, snapshot, vocab));

    case "vehicle": {
      const cart = entry.cart as FilterableCart;
      // Related: same model first, then same make, then same location.
      const pools = [
        snapshot.carts.filter((other) => other.id !== cart.id && other.make === cart.make && other.model === cart.model),
        snapshot.carts.filter((other) => other.id !== cart.id && other.make === cart.make),
        snapshot.carts.filter((other) => other.id !== cart.id && other.location === cart.location),
        snapshot.carts.filter((other) => other.id !== cart.id),
      ];
      const seen = new Set<string>();
      const related: FilterableCart[] = [];
      for (const pool of pools) {
        for (const other of pool) {
          if (related.length >= 4) break;
          if (seen.has(other.id)) continue;
          seen.add(other.id);
          related.push(other);
        }
      }
      return renderVehiclePage({ cart: cart as never, snapshot, related });
    }

    case "brands":
      return renderBrandsIndex(snapshot);
    case "brand":
      return renderBrandPage(entry.make, snapshot);
    case "model":
      return renderModelPage(entry.make, entry.model, snapshot);

    case "locations":
      return renderLocationsIndex(snapshot);
    case "location":
      return renderLocationPage(entry.store, snapshot);
    case "location-inventory": {
      const store = entry.store;
      const path = `/locations/${store.slug}/inventory/`;
      return renderListingPage({
        snapshot,
        vocab,
        path,
        locked: { location: [store.slug] },
        h1: `Golf Carts in ${store.city}, ${store.stateCode}`,
        title: `Golf Carts in ${store.city} ${store.stateCode} — {n} in Stock`,
        description: `{n} golf carts in stock in ${store.city}, ${store.state}. New, used, street legal and lifted. 0% APR for 48 months. Call ${site.phone}.`,
        question: `What golf carts are in stock in ${store.city}?`,
        answer:
          `The ${store.city}, ${store.stateCode} lot has {n} golf carts on it — {new} new and {used} used, ` +
          `priced {min} to {max}. It can also draw on our full shared inventory across every location, ` +
          `so ask even if what you want is not on this page.`,
        copy: `<h2>What is on the ${store.city} lot?</h2>
<p>{n} carts, of which {new} are new and {used} used, {electric} electric and {gas} gas. {streetLegal} are built to street-legal LSV specification and {lifted} are lifted. Prices run {min} to {max}.</p>
<h2>Can this location get a cart it does not have?</h2>
<p>Usually. All our dealerships share one inventory, so a cart standing on another lot can normally be transferred here. Call ${site.phone} and the specialist can see every cart at once.</p>
<h2>Delivery from ${store.city}</h2>
<p>Local delivery runs from this lot and nationwide transport is quoted by mileage. ${store.serviceArea?.length ? `We regularly deliver to ${store.serviceArea.slice(0, 5).join(", ")}.` : ""} See <a href="/delivery/">golf cart delivery</a>.</p>`,
        keywords: [
          ...(store.keywords ?? []),
          `golf carts for sale ${store.city} ${store.stateCode}`,
          `golf cart dealer ${store.city}`,
        ],
        faqTopics: ["inventory", "delivery", "buying"],
        breadcrumbs: [
          { href: "/", label: "Home" },
          { href: "/locations/", label: "Locations" },
          { href: `/locations/${store.slug}/`, label: `${store.city}, ${store.stateCode}` },
          { href: path, label: "Inventory" },
        ],
        related: snapshot.stores
          .filter((other) => other.slug !== store.slug && other.cartCount > 0)
          .slice(0, 10)
          .map((other) => ({
            href: `/locations/${other.slug}/inventory/`,
            label: `Golf carts in ${other.city}, ${other.stateCode} (${other.cartCount})`,
          })),
        relatedHeading: "Other locations",
        page: entry.page,
      });
    }

    case "guides":
      return renderGuidesIndex(snapshot);
    case "guide":
      return renderGuidePage(entry.guide, snapshot);

    case "content":
      switch (entry.path) {
        case "/financing/": return renderFinancingPage(snapshot);
        case "/about/": return renderAboutPage(snapshot);
        case "/contact/": return renderContactPage(snapshot);
        case "/service/": return renderServicePage(snapshot);
        case "/trade-in/": return renderTradeInPage(snapshot);
        case "/delivery/": return renderDeliveryPage(snapshot);
        case "/faq/": return renderFaqPage(snapshot);
        default: throw new Error(`No renderer for content route ${entry.path}`);
      }

    case "sitemap":
      return renderHtmlSitemap(snapshot);
    case "legal":
      return renderLegalPage(entry.legalKind!, snapshot);
    case "404":
      return renderNotFoundPage(snapshot);

    default:
      throw new Error(`No renderer for route kind ${entry.kind}`);
  }
}

/* -------------------------------------------------------------------- run --- */

function countFiles(directory: string): number {
  let total = 0;
  for (const name of readdirSync(directory)) {
    const full = join(directory, name);
    total += statSync(full).isDirectory() ? countFiles(full) : 1;
  }
  return total;
}

function main() {
  if (!existsSync(SNAPSHOT)) {
    process.stderr.write("FATAL: src/data/snapshot.json is missing. Run `npm run fetch-data` first.\n");
    process.exit(1);
  }
  if (!existsSync(DIST)) {
    process.stderr.write("FATAL: dist/ does not exist. Run `vite build` before prerendering.\n");
    process.exit(1);
  }

  const snapshot: Snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const vocab = buildVocabulary(snapshot.carts);
  const assets = resolveAssets();
  const routes = buildRouteTable(snapshot);

  process.stderr.write(
    `Prerendering ${routes.length} routes for ${site.domain}\n` +
      `  css ${assets.css}\n  js  ${assets.site}\n  js  ${assets.inventory}\n`,
  );

  const failures: Array<{ path: string; error: string }> = [];
  const byKind: Record<string, number> = {};

  for (const entry of routes) {
    try {
      const html = minify(inject(renderRoute(entry, snapshot, vocab), assets));
      emitPage(entry.path, html);
      byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
    } catch (error) {
      failures.push({ path: entry.path, error: (error as Error).message });
    }
  }

  if (failures.length) {
    process.stderr.write(`\n${failures.length} routes failed to render:\n`);
    for (const failure of failures.slice(0, 20)) {
      process.stderr.write(`  ${failure.path} — ${failure.error}\n`);
    }
    process.exit(1);
  }

  /* --- host files ------------------------------------------------------- */

  // A deep link that misses any prerendered route lands on 404.html. GitHub
  // Pages serves it automatically for a custom domain and a project site alike.
  const notFound = resolve(DIST, "404.html");
  if (!existsSync(notFound)) {
    process.stderr.write("FATAL: 404.html was not rendered.\n");
    process.exit(1);
  }
  // Also copy the home page to 404.html's sibling name used by some hosts.
  copyFileSync(resolve(DIST, "404.html"), resolve(DIST, "not-found.html"));

  // .nojekyll and CNAME are emitted into public/ by generate-seo.ts, which Vite
  // copies. Verify rather than re-write, so there is one owner for each.
  for (const required of [".nojekyll", "sitemap.xml", "robots.txt"]) {
    if (!existsSync(resolve(DIST, required))) {
      process.stderr.write(
        `FATAL: dist/${required} is missing — run \`npm run generate-seo\` before \`vite build\`.\n`,
      );
      process.exit(1);
    }
  }

  /* --- report ----------------------------------------------------------- */

  const warnings = seoWarnings();
  process.stderr.write(`\n${"-".repeat(72)}\nPrerendered ${written} pages\n${"-".repeat(72)}\n`);
  for (const [kind, count] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
    process.stderr.write(`  ${kind.padEnd(20)} ${String(count).padStart(4)}\n`);
  }
  process.stderr.write(`\n  dist/ now holds ${countFiles(DIST)} files\n`);

  if (warnings.length) {
    process.stderr.write(`\n  ${warnings.length} SEO length warnings:\n`);
    for (const warning of warnings.slice(0, 25)) process.stderr.write(`    ${warning}\n`);
    if (warnings.length > 25) process.stderr.write(`    …and ${warnings.length - 25} more\n`);
  } else {
    process.stderr.write(`\n  no SEO length warnings: every title <=60 and description <=155 chars\n`);
  }

  writeFileSync(
    resolve(root, "src/data/routes.json"),
    JSON.stringify({ generatedAt: isoStamp(), count: paths.length, paths }),
    "utf8",
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`\nFATAL: ${(error as Error).stack ?? error}\n`);
    process.exit(1);
  }
}
