/**
 * Listing pages: /inventory/, every prerendered filter route, and each
 * location's inventory page.
 *
 * The first page of results is rendered as real HTML server-side, so a crawler
 * and a JavaScript-off visitor both see carts rather than an empty shell
 * (Phase 4). src/client/inventory.ts then takes over for filtering, using the
 * same parse/filter/sort functions this file does — so the hydrated grid is the
 * same grid.
 */

import { site, salesEvent } from "../../src/config/site.ts";
import { esc, withBase, formatPrice, monthlyPayment, clamp } from "../lib/util.ts";
import { renderPage } from "../lib/layout.ts";
import {
  cartCard, filterPanel, filterChips, sortControl, pager, emptyState,
  ignoredNote, ctaBand, relatedLinks, faqSection, answerBlock, statStrip,
  type FacetGroup,
} from "../lib/components.ts";
import { preloadCartImage } from "../lib/images.ts";
import {
  parseQuery, filterCarts, sortCarts, allFacetCounts, describeFilters,
  serializeQuery, paginate, MULTI_FIELDS, FIELD_LABELS, FEATURE_LABELS,
  type FilterState, type FilterableCart, type MultiField, type Vocabulary, type IgnoredValue,
} from "../../src/lib/filters.ts";
import {
  graph, collectionPageNode, itemListNode, faqNode, type Crumb, type Store,
} from "../lib/schema.ts";
import { faq } from "../../src/config/faq.ts";

export const PAGE_SIZE = 24;

export interface Snapshot {
  updatedAt: string;
  summary: Record<string, number | null>;
  facets: Record<string, Array<{ key: string; label: string; count: number; makeKey?: string }>>;
  stores: Store[];
  carts: FilterableCart[];
}

export interface RenderListingOptions {
  snapshot: Snapshot;
  vocab: Vocabulary;
  path: string;
  /** Query string for this specific prerendered variant (usually empty). */
  search?: string;
  locked: Partial<Record<MultiField, string[]>>;
  h1: string;
  title: string;
  description: string;
  question: string;
  answer: string;
  copy: string;
  keywords: string[];
  faqTopics?: string[];
  faqEntries?: Array<{ q: string; a: string }>;
  breadcrumbs: Crumb[];
  related?: Array<{ href: string; label: string }>;
  relatedHeading?: string;
  canonicalTo?: string;
  noindex?: boolean;
  /** 1-based page number for a paginated variant. */
  page?: number;
}

/** Facet label maps, built from the snapshot so labels match the data. */
function labelMaps(snapshot: Snapshot): Partial<Record<MultiField, Record<string, string>>> {
  const from = (entries: Array<{ key: string; label: string }> = []) =>
    Object.fromEntries(entries.map((entry) => [entry.key, entry.label]));
  return {
    condition: from(snapshot.facets.conditions),
    fuel: from(snapshot.facets.fuels),
    make: from(snapshot.facets.makes),
    model: from(snapshot.facets.models),
    color: from(snapshot.facets.colors),
    passengers: from(snapshot.facets.passengers),
    drivetrain: from(snapshot.facets.drivetrains),
    battery: from(snapshot.facets.batteries),
    tire: from(snapshot.facets.tires),
    location: from(snapshot.facets.locations),
    feature: FEATURE_LABELS,
  };
}

/** Apply the route's locked filters on top of the parsed query state. */
function applyLocked(state: FilterState, locked: Partial<Record<MultiField, string[]>>): FilterState {
  const next: FilterState = { ...state };
  for (const field of MULTI_FIELDS) {
    const values = locked[field];
    if (!values?.length) continue;
    // The route's own values win: a locked route is a subset of the catalogue,
    // and the query string must not be able to widen it.
    next[field] = values;
  }
  return next;
}

/** Interpolate the live numbers into copy so no figure is ever hardcoded. */
function interpolate(text: string, context: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key) => context[key] ?? match);
}

function buildContext(snapshot: Snapshot, count: number, results: FilterableCart[]): Record<string, string> {
  const prices = results.map((cart) => cart.price).filter((price): price is number => typeof price === "number");
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const states = new Set(snapshot.stores.map((store) => store.state)).size;
  return {
    n: String(count),
    // Plural-aware nouns: a category with exactly one cart in it must not read
    // "1 golf carts" in the meta description a searcher sees.
    carts: count === 1 ? "cart" : "carts",
    Carts: count === 1 ? "Cart" : "Carts",
    is: count === 1 ? "is" : "are",
    new: String(results.filter((cart) => cart.condition === "new").length),
    used: String(results.filter((cart) => cart.condition === "used").length),
    electric: String(results.filter((cart) => cart.fuel === "electric").length),
    gas: String(results.filter((cart) => cart.fuel === "gas").length),
    lithium: String(results.filter((cart) => cart.battery === "lithium").length),
    lifted: String(results.filter((cart) => cart.features.includes("lifted")).length),
    streetLegal: String(results.filter((cart) => cart.features.includes("street-legal")).length),
    min: min ? formatPrice(min) : "—",
    max: max ? formatPrice(max) : "—",
    minMonthly: min ? `$${Math.round(monthlyPayment(min)!).toLocaleString("en-US")}` : "—",
    maxMonthly: max ? `$${Math.round(monthlyPayment(max)!).toLocaleString("en-US")}` : "—",
    stores: String(snapshot.stores.length),
    states: String(states),
    phone: site.phone,
  };
}

/** The facet groups shown in the sidebar, in display order. */
function facetGroups(
  carts: FilterableCart[],
  state: FilterState,
  snapshot: Snapshot,
): FacetGroup[] {
  const counts = allFacetCounts(carts, state, labelMaps(snapshot));
  const order: Array<[MultiField, boolean]> = [
    ["condition", false],
    ["fuel", false],
    ["feature", false],
    ["make", false],
    ["passengers", false],
    ["battery", false],
    ["color", true],
    ["tire", false],
    ["drivetrain", false],
    ["model", true],
    ["location", true],
  ];
  return order.map(([field, collapsed]) => ({
    field,
    label: FIELD_LABELS[field],
    options: counts[field],
    collapsed,
  }));
}

export function renderListingPage(options: RenderListingOptions): string {
  const { snapshot, vocab, locked } = options;
  const search = options.search ?? "";

  const parsed = parseQuery(search, vocab);
  let state = applyLocked(parsed.state, locked);
  if (options.page && options.page > 1) state = { ...state, page: options.page };

  const results = sortCarts(filterCarts(snapshot.carts, state), state.sort);
  const slice = paginate(results, state.page, PAGE_SIZE);
  const context = buildContext(snapshot, results.length, results);

  const title = clamp(interpolate(options.title, context), 60);
  const description = clamp(interpolate(options.description, context), 155);
  const answer = interpolate(options.answer, context);
  const copy = interpolate(options.copy, context).replace(
    /href="(\/[^"]*)"/g,
    (match, href) => `href="${withBase(href)}"`,
  );

  // Active chips exclude the locked values: those are the page, not a filter.
  const chipState: FilterState = { ...state };
  for (const field of MULTI_FIELDS) {
    if (locked[field]?.length) chipState[field] = [];
  }
  const active = describeFilters(chipState, labelMaps(snapshot));

  /**
   * Pagination URLs.
   *
   * The page number lives in the query string, which is the canonical form the
   * client writes and the one the filter contract specifies. But `?page=2` on a
   * static host serves page 1's HTML until JavaScript runs, so page 2 onwards
   * is *also* prerendered at `/<route>/page/2/` and the server-rendered pager
   * links there: crawlable, and correct with JavaScript off.
   *
   * Both forms render the same carts. The `/page/N/` files are noindex,follow —
   * every cart already has its own indexable page in the sitemap — and they
   * declare their page number on the container so hydration does not snap the
   * view back to page 1.
   */
  // An alias route (/inventory/pre-owned/) has no pagination of its own: it
  // canonicals into a parent that is the same result set, so page 2 links onto
  // the parent's real, indexable pages rather than duplicating them.
  const pagerRoot = options.canonicalTo ?? options.path;
  const pagePath = (page: number) => (page > 1 ? `${pagerRoot}page/${page}/` : options.path);
  const hrefFor = (page: number) => {
    const query = serializeQuery({ ...state, page: 1 }, locked);
    return withBase(pagePath(page)) + (query ? `?${query}` : "");
  };

  const groups = facetGroups(snapshot.carts, state, snapshot);

  const grid =
    slice.items.length === 0
      ? emptyState(active, parsed.ignored)
      : `<div class="grid-carts" data-inventory-grid data-testid="grid-inventory">
${slice.items.map((cart, index) => cartCard(cart as never, index === 0)).join("\n")}
</div>`;

  const stats = [
    { value: String(results.length), label: results.length === 1 ? "cart in stock" : "carts in stock" },
    { value: context.min, label: "lowest price" },
    { value: context.max, label: "highest price" },
    { value: String(snapshot.stores.length), label: "locations" },
  ];

  const body = `<div class="page-head">
  <div class="wrap">
    <p class="eyebrow">${esc(salesEvent.name)}</p>
    <h1>${esc(options.h1)}</h1>
${answerBlock(options.question, answer, snapshot.updatedAt.slice(0, 10))}
${statStrip(stats)}
  </div>
</div>

<section class="section" id="results">
  <div class="wrap inventory-layout">
    <aside class="inventory-layout__filters">
${filterPanel(groups, state, locked)}
    </aside>
    <div class="inventory-layout__results" data-inventory
         data-page-size="${PAGE_SIZE}"
         data-base-path="${esc(withBase(options.path))}"
         data-locked="${esc(JSON.stringify(locked))}"
         data-index-url="${esc(withBase("data/inventory-index.json"))}"
         data-site-base="${esc(withBase("/"))}"
         data-route-page="${slice.page}"
         data-route-path="${esc(withBase(options.path))}"
         data-phone="${esc(site.phone)}"
         data-phone-tel="${esc(site.phoneTel)}">
      <div class="inventory-toolbar">
        <p class="inventory-count" data-inventory-count><strong>${results.length.toLocaleString("en-US")}</strong> ${results.length === 1 ? "cart" : "carts"}${slice.total ? ` &middot; showing ${slice.from}–${slice.to}` : ""}</p>
        <div class="inventory-toolbar__controls">
${sortControl(state)}
          <button class="btn btn--outline btn--sm inventory-toolbar__filter-toggle" type="button" data-testid="button-open-filters" aria-expanded="false">Filters</button>
        </div>
      </div>
${ignoredNote(parsed.ignored)}
${filterChips(active)}
${grid}
${pager(slice.page, slice.pageCount, hrefFor)}
    </div>
  </div>
</section>

<section class="section section--surface">
  <div class="wrap wrap-narrow">
    <article class="prose">
${copy}
    </article>
  </div>
</section>

${relatedLinks(options.relatedHeading ?? "Keep looking", options.related ?? [])}
${faqSection(options.faqEntries ?? pickFaq(options.faqTopics ?? []))}
${ctaBand()}`;

  const faqEntries = options.faqEntries ?? pickFaq(options.faqTopics ?? []);

  return renderPage({
    path: pagePath(slice.page),
    canonical: options.canonicalTo ?? pagePath(slice.page),
    title,
    description,
    body,
    breadcrumbs: options.breadcrumbs,
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    // Page 2+ is navigation, not a ranking target: every cart on it already has
    // its own indexable page listed in the sitemap.
    noindex: options.noindex || slice.page > 1,
    prev: slice.page > 1 ? pagePath(slice.page - 1) : undefined,
    next: slice.page < slice.pageCount ? pagePath(slice.page + 1) : undefined,
    head:
      `<meta name="keywords" content="${esc(options.keywords.join(", "))}">` +
      // The first card is the LCP element on a listing page.
      (slice.items[0] ? `\n${preloadCartImage(slice.items[0].images?.[0], "card")}` : ""),
    scripts: ["__JS_INVENTORY__"],
    nodes: [
      collectionPageNode({
        path: options.path,
        title,
        description,
        modifiedAt: snapshot.updatedAt,
        total: results.length,
      }),
      itemListNode(options.path, slice.items, results.length),
      ...(faqEntries.length ? [faqNode(options.path, faqEntries)] : []),
    ],
  });
}

/** Pull FAQ entries for the given topics, deduplicated and capped. */
export function pickFaq(topics: string[], limit = 6): Array<{ q: string; a: string }> {
  if (!topics.length) return [];
  const seen = new Set<string>();
  const out: Array<{ q: string; a: string }> = [];
  for (const topic of topics) {
    for (const entry of faq) {
      if (entry.topic !== topic || seen.has(entry.q)) continue;
      seen.add(entry.q);
      out.push({ q: entry.q, a: entry.a });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
