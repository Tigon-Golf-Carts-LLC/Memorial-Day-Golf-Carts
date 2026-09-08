/**
 * The page shell: <head>, header, footer, and the JSON-LD graph.
 *
 * Every route renders through `renderPage()`, which is what guarantees the
 * Phase 7 on-page rules hold everywhere at once: exactly one <h1> (supplied by
 * the body), a unique <title> under 60 characters, a meta description under
 * 155, a self-referencing canonical, OG/Twitter tags with a real image,
 * rendered breadcrumbs, and a schema graph matching the page's actual content.
 *
 * Phase 5: no absolute asset path is written by hand. Everything goes through
 * `withBase()` so a project-site deploy under /<repo>/ works unchanged.
 *
 * Phase 8: the phone number is rendered from `site.phone` and linked with
 * `site.phoneTel` in the header, the footer and a sticky mobile bar, and the
 * same digits appear in the schema graph.
 */

import { site, nav, salesEvent } from "../../src/config/site.ts";
import { esc, withBase, absoluteUrl, jsonLd, clamp, isoStamp } from "./util.ts";
import {
  graph, organizationNode, websiteNode, webPageNode, breadcrumbNode,
  type Crumb, type Store,
} from "./schema.ts";

export interface PageOptions {
  /** Route path, e.g. "/inventory/new/". Used for the canonical and @id values. */
  path: string;
  title: string;
  description: string;
  /** Full page body HTML, including exactly one <h1>. */
  body: string;
  breadcrumbs?: Crumb[];
  /** Extra schema nodes for what this page actually renders. */
  nodes?: unknown[];
  stores?: Store[];
  ogType?: "website" | "article" | "product";
  ogImage?: string;
  /** ISO timestamp for dateModified. Defaults to the snapshot's updatedAt. */
  modifiedAt?: string;
  publishedAt?: string;
  /** Emit <meta name="robots" content="noindex,follow"> for a thin route. */
  noindex?: boolean;
  /** Canonical override, for a thin filter combination folding into its parent. */
  canonical?: string;
  /** rel=prev/next for a paginated listing. */
  prev?: string;
  next?: string;
  /** Extra <head> markup (preload hints, alternates). */
  head?: string;
  /** Page-specific script module, relative to the site root. */
  scripts?: string[];
  bodyClass?: string;
}

const CURRENT_YEAR = new Date().getUTCFullYear();

/** Warn at build time rather than shipping an over-long title or description. */
const warnings: string[] = [];

export function seoWarnings(): string[] {
  return warnings;
}

function checkLengths(path: string, title: string, description: string) {
  if (title.length > 60) warnings.push(`title ${title.length} chars (>60): ${path} — "${title}"`);
  if (description.length > 155) {
    warnings.push(`description ${description.length} chars (>155): ${path}`);
  }
  if (!description) warnings.push(`missing description: ${path}`);
}

/* ---------------------------------------------------------------- header --- */

const PHONE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 ' +
  '2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 ' +
  '2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>';

function header(path: string): string {
  const link = (item: { href: string; label: string }) => {
    const current =
      item.href === "/"
        ? path === "/"
        : path === item.href || path.startsWith(item.href);
    return (
      `<li><a href="${esc(withBase(item.href))}"${current ? ' aria-current="page"' : ""}>` +
      `${esc(item.label)}</a></li>`
    );
  };

  return `<a class="skip-link" href="#main">Skip to main content</a>
<header class="site-header">
  <div class="wrap site-header__inner">
    <a class="brand" href="${esc(withBase("/"))}" aria-label="${esc(site.name)} home">
      <img src="${esc(withBase("images/logo.svg"))}" alt="${esc(site.name)}" width="200" height="40" fetchpriority="high" decoding="async">
    </a>
    <nav class="site-nav" aria-label="Main">
      <ul>
${nav.map(link).map((item) => `        ${item}`).join("\n")}
      </ul>
    </nav>
    <div class="site-header__cta">
      <a class="btn btn--primary btn--call" href="${esc(site.phoneTel)}" data-testid="link-header-phone">
        <span class="btn__icon">${PHONE_ICON}</span>
        <span class="btn__label">${esc(site.phone)}</span>
      </a>
      <button class="nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="mobilenav" aria-label="Open menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
  <nav class="mobile-nav" id="mobilenav" data-open="false" aria-label="Mobile">
    <ul>
${nav.map(link).map((item) => `      ${item}`).join("\n")}
      <li><a href="${esc(withBase("/guides/"))}">Buying Guides</a></li>
      <li><a href="${esc(withBase("/faq/"))}">FAQ</a></li>
    </ul>
  </nav>
</header>`;
}

/* --------------------------------------------------------------- footer --- */

function footer(stores: Store[]): string {
  const columns = [
    {
      heading: "Shop Golf Carts",
      links: [
        { href: "/golf-carts-for-sale/", label: "Golf carts for sale" },
        { href: "/inventory/new/", label: "New golf carts" },
        { href: "/inventory/used/", label: "Used golf carts" },
        { href: "/inventory/street-legal/", label: "Street legal golf carts" },
        { href: "/inventory/utility/", label: "Utility golf carts" },
        { href: "/inventory/fleet/", label: "Fleet golf carts" },
        { href: "/inventory/lifted/", label: "Lifted golf carts" },
        { href: "/inventory/4x4/", label: "4x4 golf carts" },
      ],
    },
    {
      heading: "Learn",
      links: [
        { href: "/guides/", label: "Buying guides" },
        { href: "/guides/lithium-vs-lead-acid-golf-cart-batteries/", label: "Lithium vs lead-acid" },
        { href: "/guides/street-legal-golf-carts-lsv-guide/", label: "Street legal & LSV rules" },
        { href: "/guides/golf-cart-tires-and-suspension/", label: "Tires & suspension" },
        { href: "/guides/off-road-and-lifted-golf-carts/", label: "Off-road & lifted carts" },
        { href: "/faq/", label: "Frequently asked questions" },
      ],
    },
    {
      heading: "Buy & Own",
      links: [
        { href: "/financing/", label: "Financing" },
        { href: "/trade-in/", label: "Trade in your cart" },
        { href: "/delivery/", label: "Delivery" },
        { href: "/service/", label: "Service & parts" },
        { href: "/brands/", label: "Brands we carry" },
        { href: "/memorial-day-golf-cart-sales-event/", label: "Memorial Day event" },
      ],
    },
  ];

  const topStores = [...stores].sort((a, b) => b.cartCount - a.cartCount).slice(0, 8);

  return `<footer class="site-footer">
  <div class="wrap">
    <div class="site-footer__grid">
      <div class="site-footer__brand">
        <img src="${esc(withBase("images/logo-light.svg"))}" alt="${esc(site.name)}" width="200" height="40" loading="lazy" decoding="async">
        <p>${esc(site.shortDescription)}</p>
        <p class="site-footer__nap">
          <a class="site-footer__phone" href="${esc(site.phoneTel)}" data-testid="link-footer-phone">${esc(site.phone)}</a><br>
          <a href="mailto:${esc(site.email)}">${esc(site.email)}</a><br>
          <span>${esc(site.hoursSummary)}</span>
        </p>
        <ul class="social">
${site.social
  .map(
    (url) =>
      `          <li><a href="${esc(url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(
        new URL(url).hostname.replace(/^www\./, "").split(".")[0],
      )}</a></li>`,
  )
  .join("\n")}
        </ul>
      </div>
${columns
  .map(
    (column) => `      <nav class="site-footer__col" aria-label="${esc(column.heading)}">
        <h2>${esc(column.heading)}</h2>
        <ul>
${column.links
  .map((link) => `          <li><a href="${esc(withBase(link.href))}">${esc(link.label)}</a></li>`)
  .join("\n")}
        </ul>
      </nav>`,
  )
  .join("\n")}
      <nav class="site-footer__col" aria-label="Locations">
        <h2>Locations</h2>
        <ul>
${topStores
  .map(
    (store) =>
      `          <li><a href="${esc(withBase(`/locations/${store.slug}/`))}">Golf carts in ${esc(store.city)}, ${esc(store.stateCode)}</a></li>`,
  )
  .join("\n")}
          <li><a href="${esc(withBase("/locations/"))}">All ${stores.length} locations</a></li>
        </ul>
      </nav>
    </div>
    <div class="site-footer__legal">
      <p>&copy; ${CURRENT_YEAR} ${esc(site.legalName)}. All rights reserved. ${esc(salesEvent.name)}.</p>
      <ul>
        <li><a href="${esc(withBase("/privacy/"))}">Privacy</a></li>
        <li><a href="${esc(withBase("/terms/"))}">Terms</a></li>
        <li><a href="${esc(withBase("/accessibility/"))}">Accessibility</a></li>
        <li><a href="${esc(withBase("/sitemap/"))}">Sitemap</a></li>
        <li><a href="${esc(withBase("/contact/"))}">Contact</a></li>
      </ul>
    </div>
  </div>
</footer>
<div class="sticky-call" role="complementary" aria-label="Call us">
  <a class="btn btn--primary" href="${esc(site.phoneTel)}" data-testid="link-sticky-phone">
    <span class="btn__icon">${PHONE_ICON}</span>
    <span class="btn__label">Call ${esc(site.phone)}</span>
  </a>
</div>`;
}

/* ---------------------------------------------------------- breadcrumbs --- */

/** Rendered breadcrumbs. The matching BreadcrumbList goes in the graph. */
export function renderBreadcrumbs(crumbs: Crumb[]): string {
  if (crumbs.length < 2) return "";
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">
  <div class="wrap">
    <ol>
${crumbs
  .map((crumb, index) => {
    const last = index === crumbs.length - 1;
    return last
      ? `      <li><span aria-current="page">${esc(crumb.label)}</span></li>`
      : `      <li><a href="${esc(withBase(crumb.href))}">${esc(crumb.label)}</a></li>`;
  })
  .join("\n")}
    </ol>
  </div>
</nav>`;
}

/* ------------------------------------------------------------ renderPage --- */

export function renderPage(options: PageOptions): string {
  const title = options.title;
  const description = clamp(options.description, 155);
  checkLengths(options.path, title, description);

  const canonical = options.canonical ? absoluteUrl(options.canonical) : absoluteUrl(options.path);
  const ogImage = absoluteUrl(options.ogImage ?? "images/og-image.png");
  const modifiedAt = options.modifiedAt ?? isoStamp();
  const crumbs = options.breadcrumbs ?? [];
  const stores = options.stores ?? [];

  const nodes: unknown[] = [
    organizationNode(stores),
    websiteNode(),
    webPageNode({
      path: options.path,
      title,
      description,
      modifiedAt,
      publishedAt: options.publishedAt,
      image: options.ogImage,
      breadcrumbId: crumbs.length >= 2 ? `${absoluteUrl(options.path)}#breadcrumb` : undefined,
    }),
    ...(crumbs.length >= 2 ? [breadcrumbNode(options.path, crumbs)] : []),
    ...(options.nodes ?? []),
  ];

  const scripts = options.scripts ?? [];

  return `<!doctype html>
<html lang="${esc(site.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
${options.noindex
    ? '<meta name="robots" content="noindex, follow">'
    : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">'}
<meta name="theme-color" content="${esc(site.themeColor)}">
<meta name="author" content="${esc(site.name)}">
<meta name="publisher" content="${esc(site.name)}">
<meta name="format-detection" content="telephone=yes">
${options.prev ? `<link rel="prev" href="${esc(absoluteUrl(options.prev))}">` : ""}
${options.next ? `<link rel="next" href="${esc(absoluteUrl(options.next))}">` : ""}

<meta property="og:type" content="${esc(options.ogType ?? "website")}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(site.name)} — ${esc(salesEvent.name)}">
<meta property="og:locale" content="${esc(site.locale)}">
${options.publishedAt ? `<meta property="article:published_time" content="${esc(options.publishedAt)}">` : ""}
<meta property="article:modified_time" content="${esc(modifiedAt)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="${esc(site.twitter)}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<meta name="twitter:image:alt" content="${esc(site.name)} — ${esc(salesEvent.name)}">

<link rel="icon" href="${esc(withBase("favicon.ico"))}" sizes="any">
<link rel="icon" href="${esc(withBase("images/logo-mark.svg"))}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${esc(withBase("apple-touch-icon.png"))}">
<link rel="manifest" href="${esc(withBase("manifest.webmanifest"))}">
<link rel="sitemap" type="application/xml" href="${esc(withBase("sitemap.xml"))}">
<link rel="preconnect" href="https://s3.amazonaws.com" crossorigin>
<link rel="stylesheet" href="__CSS__">
${options.head ?? ""}
<script type="application/ld+json">
${jsonLd(graph(nodes))}
</script>
</head>
<body${options.bodyClass ? ` class="${esc(options.bodyClass)}"` : ""}>
${header(options.path)}
${renderBreadcrumbs(crumbs)}
<main id="main">
${options.body}
</main>
${footer(stores)}
<script type="module" src="__JS_SITE__"></script>
${scripts.map((src) => `<script type="module" src="${esc(src)}"></script>`).join("\n")}
</body>
</html>
`;
}
