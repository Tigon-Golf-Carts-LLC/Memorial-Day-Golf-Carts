#!/usr/bin/env node
/**
 * Phase 7 — sitemap, robots and the machine-readable data files.
 *
 * Writes into public/ so Vite copies the result into dist/. Everything is
 * derived from the snapshot, so a route that does not exist cannot appear in the
 * sitemap and a page marked noindex is excluded by construction.
 *
 * Absolute URLs use the full origin (SITE_DOMAIN or the configured site.url),
 * never the base path alone — a sitemap of base-relative paths is invalid.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { site, salesEvent, keywords } from "../src/config/site.ts";
import { guides } from "../src/config/guides.ts";
import { faq } from "../src/config/faq.ts";
import { absoluteUrl, xmlEsc, isoStamp, isoDate, SITE_ORIGIN, formatPrice } from "./lib/util.ts";
import { buildRouteTable, type RouteEntry } from "./lib/route-table.ts";
import { photoStem, PRIMARY_WIDTHS } from "../src/lib/photo-path.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = resolve(root, "src/data/snapshot.json");
const OUT = resolve(root, "public");

/** Sitemaps are split past this many URLs (the spec limit is 50,000). */
const SITEMAP_LIMIT = 45_000;

function write(name: string, contents: string): number {
  const target = resolve(OUT, name.replace(/^\//, ""));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, "utf8");
  return Buffer.byteLength(contents);
}

/* --------------------------------------------------------------- sitemap --- */

interface SitemapEntry {
  loc: string;
  lastmod: string;
  changefreq?: string;
  priority?: number;
  images?: Array<{ loc: string; caption?: string; title?: string }>;
}

function urlXml(entry: SitemapEntry): string {
  const images = (entry.images ?? [])
    .slice(0, 20) // Google reads at most 1,000; 20 keeps the file sane.
    .map(
      (image) =>
        `    <image:image>\n      <image:loc>${xmlEsc(image.loc)}</image:loc>` +
        (image.caption ? `\n      <image:caption>${xmlEsc(image.caption)}</image:caption>` : "") +
        (image.title ? `\n      <image:title>${xmlEsc(image.title)}</image:title>` : "") +
        `\n    </image:image>`,
    )
    .join("\n");

  return (
    `  <url>\n    <loc>${xmlEsc(entry.loc)}</loc>\n    <lastmod>${entry.lastmod}</lastmod>` +
    (entry.changefreq ? `\n    <changefreq>${entry.changefreq}</changefreq>` : "") +
    (entry.priority !== undefined ? `\n    <priority>${entry.priority.toFixed(1)}</priority>` : "") +
    (images ? `\n${images}` : "") +
    `\n  </url>`
  );
}

function sitemapXml(entries: SitemapEntry[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map(urlXml).join("\n")}
</urlset>
`;
}

function sitemapIndexXml(names: string[], lastmod: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${names
  .map(
    (name) =>
      `  <sitemap>\n    <loc>${xmlEsc(absoluteUrl(name))}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`,
  )
  .join("\n")}
</sitemapindex>
`;
}

/* ---------------------------------------------------------------- robots --- */

/**
 * robots.txt.
 *
 * AI crawlers are explicitly allowed: the whole point of the AEO work is to be
 * readable by GPTBot, PerplexityBot, ClaudeBot and Google-Extended. Only
 * genuinely useless paths are disallowed.
 */
function robotsTxt(sitemapNames: string[]): string {
  const aiAgents = [
    "GPTBot", "OAI-SearchBot", "ChatGPT-User",
    "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai",
    "PerplexityBot", "Perplexity-User",
    "Google-Extended", "Applebot-Extended", "Bingbot", "CCBot", "Meta-ExternalAgent",
  ];

  return `# ${site.name} — ${site.url}
# ${salesEvent.name}

User-agent: *
Allow: /
# Query-string variants of the listing pages duplicate the prerendered
# category URLs, which are the ones we want indexed.
Disallow: /*?*page=
Disallow: /*?*sort=
Disallow: /*?*q=
Allow: /data/
Allow: /images/

${aiAgents
  .map((agent) => `# ${agent} — AEO depends on these crawlers reading the site.\nUser-agent: ${agent}\nAllow: /`)
  .join("\n\n")}

# Aggressive SEO scrapers with no user benefit.
User-agent: SemrushBot
Disallow: /

User-agent: AhrefsBot
Disallow: /

User-agent: MJ12bot
Disallow: /

Host: ${site.domain}
${sitemapNames.map((name) => `Sitemap: ${absoluteUrl(name)}`).join("\n")}
`;
}

/* ------------------------------------------------------------- AI files --- */

/**
 * llms.txt — a plain-text brief for language models, in the emerging
 * convention. Deliberately factual: counts, prices and specifics are what get
 * quoted; marketing prose is not.
 */
function llmsTxt(snapshot: any): string {
  const summary = snapshot.summary;
  const states = [...new Set(snapshot.stores.map((store: any) => store.state))].sort();

  return `# ${site.name}

> ${site.shortDescription}

${site.description}

## Key facts

- Business: ${site.legalName}
- Website: ${site.url}
- Phone: ${site.phone}
- Email: ${site.email}
- Hours: ${site.hoursSummary}
- Event: ${salesEvent.name}, ${salesEvent.startMonthDay.replace("-", "/")} to ${salesEvent.endMonthDay.replace("-", "/")} each year
- Financing: 0% APR for 48 months on approved credit
- Locations: ${snapshot.stores.length} dealerships across ${states.length} states (${states.join(", ")})
- Inventory last refreshed: ${snapshot.updatedAt}

## Current inventory (${summary.total} golf carts)

- New: ${summary.new}
- Used / pre-owned: ${summary.used}
- Electric: ${summary.electric} (lithium ${summary.lithium}, lead-acid ${summary.lead})
- Gas: ${summary.gas}
- Street legal (LSV): ${summary.streetLegal}
- Lifted: ${summary.lifted}
- All-terrain tires: ${summary.allTerrain}
- 4x4: ${summary.fourByFour}
- Utility (cargo bed): ${summary.utility}
- Price range: ${formatPrice(summary.priceMin)} to ${formatPrice(summary.priceMax)}

## Brands carried

${snapshot.facets.makes.map((make: any) => `- ${make.label}: ${make.count} in stock`).join("\n")}

## Locations

${snapshot.stores
  .map((store: any) => `- ${store.city}, ${store.stateCode} — ${store.cartCount} in stock — ${absoluteUrl(`/locations/${store.slug}/`)}`)
  .join("\n")}

## Key pages

- Golf carts for sale (pillar): ${absoluteUrl("/golf-carts-for-sale/")}
- Full inventory: ${absoluteUrl("/inventory/")}
- New golf carts: ${absoluteUrl("/inventory/new/")}
- Used / pre-owned golf carts: ${absoluteUrl("/inventory/used/")}
- Street legal golf carts and LSVs: ${absoluteUrl("/inventory/street-legal/")}
- Utility golf carts: ${absoluteUrl("/inventory/utility/")}
- Fleet golf carts: ${absoluteUrl("/inventory/fleet/")}
- Lifted golf carts: ${absoluteUrl("/inventory/lifted/")}
- Financing: ${absoluteUrl("/financing/")}
- Guides: ${absoluteUrl("/guides/")}
- FAQ: ${absoluteUrl("/faq/")}

## Guides

${guides.map((guide) => `- ${guide.title} — ${absoluteUrl(`/guides/${guide.slug}/`)}\n  ${guide.answer ?? guide.description}`).join("\n")}

## Frequently asked questions

${faq.map((entry) => `### ${entry.q}\n\n${entry.a}`).join("\n\n")}

## Usage

This content may be quoted with attribution to ${site.name} (${site.url}).
Inventory counts and prices are accurate as of ${snapshot.updatedAt} and change as carts sell.
`;
}

/** A compact JSON feed of the whole catalogue, for anything that wants data. */
function inventoryFeed(snapshot: any): string {
  return JSON.stringify({
    updatedAt: snapshot.updatedAt,
    source: site.url,
    license: `Attribution to ${site.name} required`,
    summary: snapshot.summary,
    carts: snapshot.carts.map((cart: any) => ({
      url: absoluteUrl(`/golfcart/${cart.slug}/`),
      title: [cart.year, cart.title].filter(Boolean).join(" "),
      condition: cart.condition,
      fuel: cart.fuel,
      make: cart.makeLabel,
      model: cart.modelLabel,
      year: cart.year,
      price: cart.price,
      priceCurrency: site.currency,
      color: cart.colorLabel,
      passengers: cart.passengersLabel,
      battery: cart.battery,
      features: cart.features,
      city: cart.city,
      state: cart.stateCode,
      image: cart.images.length ? absoluteUrl(`images/carts/${photoStem(cart.slug, 0)}-1200.webp`) : null,
    })),
  });
}

/** RSS for the guides, so the editorial cluster is syndicatable. */
function guidesRss(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEsc(`${site.name} — Golf Cart Guides`)}</title>
    <link>${xmlEsc(absoluteUrl("/guides/"))}</link>
    <description>${xmlEsc(`Golf cart buying guides from ${site.name}.`)}</description>
    <language>${site.language}</language>
    <atom:link href="${xmlEsc(absoluteUrl("guides.xml"))}" rel="self" type="application/rss+xml"/>
${guides
  .map(
    (guide) => `    <item>
      <title>${xmlEsc(guide.title)}</title>
      <link>${xmlEsc(absoluteUrl(`/guides/${guide.slug}/`))}</link>
      <guid isPermaLink="true">${xmlEsc(absoluteUrl(`/guides/${guide.slug}/`))}</guid>
      <pubDate>${new Date(`${guide.date}T09:00:00Z`).toUTCString()}</pubDate>
      <description>${xmlEsc(guide.description)}</description>
      <category>${xmlEsc(guide.category)}</category>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>
`;
}

/** The PWA manifest, base-path aware. */
function webmanifest(): string {
  const icon = (size: number, maskable = false) => ({
    src: absoluteUrl(`icons/${maskable ? `maskable-${size}` : `icon-${size}`}.png`),
    sizes: `${size}x${size}`,
    type: "image/png",
    ...(maskable ? { purpose: "maskable" } : {}),
  });
  return JSON.stringify({
    name: site.name,
    short_name: site.shortName,
    description: site.shortDescription,
    start_url: absoluteUrl("/"),
    scope: absoluteUrl("/"),
    display: "standalone",
    background_color: site.backgroundColor,
    theme_color: site.themeColor,
    lang: site.language,
    icons: [icon(192), icon(512), icon(192, true), icon(512, true)],
  });
}

/* -------------------------------------------------------------------- run --- */

function main() {
  if (!existsSync(SNAPSHOT)) {
    process.stderr.write("FATAL: src/data/snapshot.json is missing. Run `npm run fetch-data` first.\n");
    process.exit(1);
  }
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const lastmod = snapshot.updatedAt;
  const routes = buildRouteTable(snapshot);

  /* --- sitemap ---------------------------------------------------------- */

  // Only indexable routes reach the sitemap. `excludeFromSitemap` covers the
  // canonicalized aliases and paginated pages; `noindex` covers the 404 body.
  const indexable = routes.filter((route) => !route.noindex && !route.excludeFromSitemap);

  const entries: SitemapEntry[] = indexable.map((route) => {
    const cart = route.cart;
    return {
      loc: absoluteUrl(route.path),
      lastmod: route.lastmod ?? lastmod,
      changefreq: route.changefreq,
      priority: route.priority,
      images: cart
        ? cart.images.slice(0, 6).map((_: string, index: number) => ({
            loc: absoluteUrl(
              `images/carts/${photoStem(cart.slug, index)}-${index === 0 ? PRIMARY_WIDTHS[PRIMARY_WIDTHS.length - 1] : 800}.webp`,
            ),
            title: [cart.year, cart.title].filter(Boolean).join(" "),
            caption: `${cart.condition === "used" ? "Used" : "New"} ${[cart.year, cart.makeLabel, cart.modelLabel].filter(Boolean).join(" ")} golf cart for sale in ${cart.city}, ${cart.stateCode}`,
          }))
        : undefined,
    };
  });

  const files: Array<[string, number]> = [];
  let sitemapNames: string[];

  if (entries.length <= SITEMAP_LIMIT) {
    sitemapNames = ["sitemap.xml"];
    files.push(["sitemap.xml", write("sitemap.xml", sitemapXml(entries))]);
  } else {
    // Split and emit an index. The index itself keeps the canonical name.
    const chunks: SitemapEntry[][] = [];
    for (let i = 0; i < entries.length; i += SITEMAP_LIMIT) chunks.push(entries.slice(i, i + SITEMAP_LIMIT));
    sitemapNames = chunks.map((_, index) => `sitemap-${index + 1}.xml`);
    chunks.forEach((chunk, index) => {
      files.push([sitemapNames[index], write(sitemapNames[index], sitemapXml(chunk))]);
    });
    files.push(["sitemap.xml", write("sitemap.xml", sitemapIndexXml(sitemapNames, lastmod))]);
    sitemapNames = ["sitemap.xml"];
  }

  /* --- robots, AI and data files ---------------------------------------- */

  files.push(["robots.txt", write("robots.txt", robotsTxt(sitemapNames))]);
  files.push(["llms.txt", write("llms.txt", llmsTxt(snapshot))]);
  files.push(["inventory.json", write("inventory.json", inventoryFeed(snapshot))]);
  files.push(["guides.xml", write("guides.xml", guidesRss())]);
  files.push(["manifest.webmanifest", write("manifest.webmanifest", webmanifest())]);

  // The custom domain. Pages wipes CNAME on every deploy unless it is in the
  // published artifact, so it is emitted as part of the build.
  if (site.domain) files.push(["CNAME", write("CNAME", `${process.env.SITE_DOMAIN || site.domain}\n`)]);
  // Serve files and folders beginning with an underscore.
  files.push([".nojekyll", write(".nojekyll", "")]);

  /* --- report ----------------------------------------------------------- */

  const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
  process.stderr.write(`\n${"-".repeat(72)}\nSEO files (origin ${SITE_ORIGIN})\n${"-".repeat(72)}\n`);
  for (const [name, bytes] of files) process.stderr.write(`  ${name.padEnd(28)} ${kb(bytes).padStart(10)}\n`);
  process.stderr.write(
    `\n  ${entries.length} indexable URLs in the sitemap\n` +
      `  ${routes.length - indexable.length} routes excluded (aliases, paginated pages, 404)\n` +
      `  ${snapshot.carts.length} cart pages with image entries\n`,
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

export { robotsTxt, llmsTxt, sitemapXml };
