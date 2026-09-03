/**
 * Reusable page fragments.
 *
 * Two AEO-specific components live here (Phase 7):
 *   `answerBlock`  — the 40–60 word plain-language answer that opens every page
 *                    above the fold, before any marketing copy.
 *   `faqSection`   — question-shaped headings with concise answers, matched by
 *                    an FAQPage node in the graph.
 *
 * `cartCard` is duplicated in src/client/inventory.ts, which re-renders cards in
 * the browser. The two are kept deliberately identical in markup so hydration
 * does not reflow the grid; the shared test in tests/parity.test.ts pins that.
 */

import { site, salesEvent } from "../../src/config/site.ts";
import { esc, withBase, formatPrice, monthlyPayment } from "./util.ts";
import { renderImage, cartImageEntry, cartImageAlt } from "./images.ts";
import { FEATURE_LABELS, FIELD_LABELS, type FacetCount, type MultiField, type FilterState, type ActiveFilter } from "../../src/lib/filters.ts";

/* --------------------------------------------------------------- AEO bits --- */

/**
 * The answer-first summary.
 *
 * `question` becomes the visually-hidden heading context; `answer` should be
 * 40–60 words of plain prose that directly answers the page's core question.
 * Word count is asserted at build time by script/verify.ts.
 */
export function answerBlock(question: string, answer: string, updated?: string): string {
  return `<div class="answer-block" data-aeo-answer>
  <p class="answer-block__q">${esc(question)}</p>
  <p class="answer-block__a">${answer}</p>
${updated ? `  <p class="answer-block__meta">Updated ${esc(updated)}</p>` : ""}
</div>`;
}

export interface FaqEntry {
  q: string;
  a: string;
  topic?: string;
}

/** A rendered Q&A section. Pair it with `faqNode()` in the page's graph. */
export function faqSection(entries: FaqEntry[], heading = "Questions and answers"): string {
  if (!entries.length) return "";
  return `<section class="section section--surface" id="faq">
  <div class="wrap wrap-narrow">
    <h2>${esc(heading)}</h2>
    <div class="faq">
${entries
  .map(
    (entry) => `      <details class="faq-item">
        <summary><h3>${esc(entry.q)}</h3></summary>
        <div class="faq-item__body"><p>${esc(entry.a)}</p></div>
      </details>`,
  )
  .join("\n")}
    </div>
  </div>
</section>`;
}

/** A specification table. Machines extract these cleanly; prose they do not. */
export function specTable(rows: Array<[string, string]>, caption?: string): string {
  const filled = rows.filter(([, value]) => value !== "" && value !== null && value !== undefined);
  if (!filled.length) return "";
  return `<div class="table-scroll">
  <table class="spec-table">
${caption ? `    <caption>${esc(caption)}</caption>` : ""}
    <tbody>
${filled
  .map(([label, value]) => `      <tr><th scope="row">${esc(label)}</th><td>${esc(value)}</td></tr>`)
  .join("\n")}
    </tbody>
  </table>
</div>`;
}

/** A comparison table with a header row. */
export function comparisonTable(headers: string[], rows: string[][], caption?: string): string {
  return `<div class="table-scroll">
  <table class="spec-table spec-table--cols">
${caption ? `    <caption>${esc(caption)}</caption>` : ""}
    <thead><tr>${headers.map((header) => `<th scope="col">${esc(header)}</th>`).join("")}</tr></thead>
    <tbody>
${rows
  .map(
    (row) =>
      `      <tr>${row
        .map((cell, index) => (index === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`))
        .join("")}</tr>`,
  )
  .join("\n")}
    </tbody>
  </table>
</div>`;
}

/* ------------------------------------------------------------- cart card --- */

export interface CardCart {
  id: string;
  slug: string;
  title: string;
  year: number | null;
  price: number | null;
  condition: string;
  fuel: string;
  makeLabel: string;
  modelLabel: string;
  colorLabel: string;
  passengersLabel: string;
  features: string[];
  city: string;
  stateCode: string;
  images: string[];
  battery?: string;
}

/**
 * One inventory card.
 *
 * `eager` marks the LCP candidates — the first row of the grid — which get
 * eager loading and fetchpriority=high. Everything below stays lazy.
 */
export function cartCard(cart: CardCart, eager = false): string {
  const href = withBase(`/golfcart/${cart.slug}/`);
  const entry = cartImageEntry(cart.images[0]);
  const alt = cartImageAlt(cart, 0);
  // No <picture>/AVIF on a grid card: the eager card is the LCP element, and a
  // plain WebP img starts fetching without the browser first resolving a source
  // list. The detail-page hero still ships AVIF, where the decode cost is paid
  // once rather than across a grid.
  const image = renderImage(entry, cart.images[0] ? `https://s3.amazonaws.com/prod.docs.s3/carts/${cart.images[0]}` : withBase("images/cart-photo-coming-soon.svg"), {
    alt,
    role: "card",
    eager,
  });

  const monthly = monthlyPayment(cart.price);
  const meta = [
    cart.year ? String(cart.year) : "",
    cart.passengersLabel,
    cart.battery === "lithium" ? "Lithium" : "",
    cart.city ? `${cart.city}, ${cart.stateCode}` : "",
  ].filter(Boolean);

  const badges = [
    `<span class="badge badge--${cart.condition === "used" ? "used" : "new"}" data-testid="badge-condition-${esc(cart.id)}">${cart.condition === "used" ? "Used" : "New"}</span>`,
    `<span class="badge badge--${cart.fuel === "electric" ? "electric" : "gas"}">${cart.fuel === "electric" ? "Electric" : "Gas"}</span>`,
    ...cart.features
      .filter((feature) => feature === "street-legal" || feature === "lifted")
      .map((feature) => `<span class="badge badge--${feature}">${esc(FEATURE_LABELS[feature])}</span>`),
  ].join("");

  return `<article class="cart-card" data-testid="card-cart-${esc(cart.id)}">
  <div class="cart-card__media">
    <span class="cart-card__flag">Memorial Day Pricing</span>
    <a href="${esc(href)}" tabindex="-1" aria-hidden="true">${image}</a>
${cart.images.length > 1 ? `    <span class="cart-card__count">${cart.images.length} photos</span>` : ""}
  </div>
  <div class="cart-card__body">
    <div class="cart-card__badges">${badges}</div>
    <h3 class="cart-card__title" data-testid="text-title-${esc(cart.id)}"><a href="${esc(href)}">${esc([cart.year, cart.title].filter(Boolean).join(" "))}</a></h3>
    <p class="cart-card__meta">${meta.map((item) => `<span>${esc(item)}</span>`).join("")}</p>
    <div class="cart-card__price-row">
      <span class="cart-card__price" data-testid="text-price-${esc(cart.id)}">${esc(formatPrice(cart.price))}</span>
${monthly ? `      <span class="cart-card__mo">$${Math.round(monthly).toLocaleString("en-US")}/mo &middot; 0% APR</span>` : ""}
    </div>
    <div class="cart-card__cta">
      <a class="btn btn--outline btn--sm" href="${esc(href)}">View Details</a>
      <a class="btn btn--primary btn--sm btn--icon" href="${esc(site.phoneTel)}" aria-label="Call ${esc(site.phone)} about the ${esc(cart.title)}">Call</a>
    </div>
  </div>
</article>`;
}

/* ---------------------------------------------------------- filter panel --- */

export interface FacetGroup {
  field: MultiField;
  label: string;
  options: FacetCount[];
  /** Rendered collapsed when there are many options. */
  collapsed?: boolean;
}

/**
 * The filter sidebar.
 *
 * Every option carries its facet count and is `disabled` when the count is
 * zero, so a shopper cannot select a dead end (Phase 3.5). The checked state is
 * derived from the URL-parsed state, which is what makes a reload restore the
 * controls without any client-side work.
 */
export function filterPanel(groups: FacetGroup[], state: FilterState, locked: Partial<Record<MultiField, string[]>>): string {
  const group = (entry: FacetGroup) => {
    const lockedValues = locked[entry.field] ?? [];
    // A locked facet belongs to the route; showing it as a togglable filter
    // would let the shopper "uncheck" the page they are on.
    if (lockedValues.length) return "";
    if (!entry.options.length) return "";

    const selected = state[entry.field];
    return `      <fieldset class="filters__group"${entry.collapsed ? ' data-collapsed="true"' : ""}>
        <legend>${esc(entry.label)}</legend>
        <div class="filters__options">
${entry.options
  .map((option) => {
    const checked = selected.includes(option.value);
    const dead = option.count === 0 && !checked;
    return `          <label class="filter-option${dead ? " is-dead" : ""}" data-testid="filter-${esc(entry.field)}-${esc(option.value)}" data-state="${checked ? "checked" : "unchecked"}">
            <input type="checkbox" data-filter-field="${esc(entry.field)}" data-filter-value="${esc(option.value)}"${checked ? " checked" : ""}${dead ? " disabled" : ""}>
            <span class="filter-option__label">${esc(option.label)}</span>
            <span class="filter-option__count" data-facet-field="${esc(entry.field)}" data-facet-value="${esc(option.value)}">${option.count}</span>
          </label>`;
  })
  .join("\n")}
        </div>
      </fieldset>`;
  };

  return `<form class="filters" data-collapsed="true" data-inventory-filters onsubmit="return false">
  <div class="filters__head">
    <h2>Filter</h2>
    <button class="btn btn--ghost btn--sm" type="button" data-inventory-reset data-testid="button-clear-all">Clear all</button>
  </div>
  <div class="filters__body">
      <div class="filters__group">
        <label class="filters__search" for="inventory-search">
          <span>Search</span>
          <input type="search" id="inventory-search" name="q" placeholder="Make, model, colour, city" value="${esc(state.q)}" data-inventory-search autocomplete="off">
        </label>
      </div>
${groups.map(group).filter(Boolean).join("\n")}
      <fieldset class="filters__group">
        <legend>Price</legend>
        <div class="filters__range">
          <label><span>Min</span><input type="number" inputmode="numeric" min="0" step="500" placeholder="Any" value="${state.priceMin ?? ""}" data-filter-range="priceMin"></label>
          <label><span>Max</span><input type="number" inputmode="numeric" min="0" step="500" placeholder="Any" value="${state.priceMax ?? ""}" data-filter-range="priceMax"></label>
        </div>
      </fieldset>
      <fieldset class="filters__group">
        <legend>Year</legend>
        <div class="filters__range">
          <label><span>From</span><input type="number" inputmode="numeric" min="1980" max="2100" placeholder="Any" value="${state.yearMin ?? ""}" data-filter-range="yearMin"></label>
          <label><span>To</span><input type="number" inputmode="numeric" min="1980" max="2100" placeholder="Any" value="${state.yearMax ?? ""}" data-filter-range="yearMax"></label>
        </div>
      </fieldset>
  </div>
</form>`;
}

/**
 * The active-filter chip row.
 *
 * The wrapper is emitted even when there is nothing to show. A prerendered
 * route is rendered with an empty query string, so `active` is empty at build
 * time on every page — if the wrapper were conditional the client would have
 * nowhere to write chips into after a filtered URL hydrated, and the chip row
 * would never appear. `[hidden]` keeps the empty container out of the layout.
 */
export function filterChips(active: ActiveFilter[]): string {
  return `<div class="chips" data-inventory-chips${active.length ? "" : " hidden"}>
${active.length ? `  <span class="chips__label">Filtering by</span>` : ""}
${active
  .map(
    (entry) =>
      `  <button class="chip" type="button" data-chip-field="${esc(entry.field)}" data-chip-value="${esc(entry.value)}" aria-label="Remove filter ${esc(entry.label)}">${esc(entry.label)}<span aria-hidden="true">&times;</span></button>`,
  )
  .join("\n")}
${active.length ? `  <button class="chip chip--clear" type="button" data-inventory-reset>Clear all</button>` : ""}
</div>`;
}

/**
 * The empty state.
 *
 * Names every active filter and offers one-click clearing (Phase 3.6), and
 * calls out any URL value that was ignored because it does not exist in the
 * catalogue (Phase 3, graceful-ignore rule) so an empty grid is never
 * unexplained.
 */
export function emptyState(active: ActiveFilter[], ignored: Array<{ field: string; value: string }> = []): string {
  return `<div class="empty-state" data-testid="text-empty-state">
  <h3>No golf carts match those filters</h3>
${active.length
    ? `  <p>You are filtering by ${active.map((entry) => `<strong>${esc(entry.label)}</strong>`).join(", ")}. Try removing one.</p>`
    : "  <p>There is nothing to show for this view.</p>"}
${ignored.length
    ? `  <p class="note">We ignored ${ignored
        .map((entry) => `<strong>${esc(entry.field)}=${esc(entry.value)}</strong>`)
        .join(", ")} because ${ignored.length === 1 ? "it is" : "they are"} not in our current stock.</p>`
    : ""}
  <div class="empty-state__cta">
    <button class="btn btn--primary" type="button" data-inventory-reset data-testid="button-clear-all-empty">Clear all filters</button>
    <a class="btn btn--outline" href="${esc(site.phoneTel)}">Call ${esc(site.phone)}</a>
  </div>
  <p class="note">We source carts weekly across all locations — call and we will look for your configuration.</p>
</div>`;
}

/**
 * A note above the grid when a URL value was ignored but results still show.
 *
 * Emitted even when empty, for the same reason as the chip row: the client
 * needs a container that exists in the prerendered HTML to write into.
 */
export function ignoredNote(ignored: Array<{ field: string; value: string }>): string {
  return `<p class="alert alert--info" data-inventory-ignored data-testid="text-ignored-filters"${ignored.length ? "" : " hidden"}>${
    ignored.length
      ? `Ignored ${ignored
          .map((entry) => `<strong>${esc(FIELD_LABELS[entry.field as MultiField] ?? entry.field)}: ${esc(entry.value)}</strong>`)
          .join(", ")} — not in our current stock. Showing everything else that matches.`
      : ""
  }</p>`;
}

/** Sort control. */
export function sortControl(state: FilterState): string {
  const options: Array<[string, string]> = [
    ["featured", "Featured"],
    ["price-asc", "Price: low to high"],
    ["price-desc", "Price: high to low"],
    ["year-desc", "Year: newest first"],
    ["year-asc", "Year: oldest first"],
  ];
  return `<label class="sort">
  <span>Sort</span>
  <select data-inventory-sort data-testid="select-sort">
${options
  .map(
    ([value, label]) =>
      `    <option value="${esc(value)}"${state.sort === value ? " selected" : ""}>${esc(label)}</option>`,
  )
  .join("\n")}
  </select>
</label>`;
}

/**
 * Pagination.
 *
 * Rendered as real links to real prerendered URLs so a crawler can walk them
 * and a shopper with JavaScript off can still page through.
 */
export function pager(page: number, pageCount: number, hrefFor: (page: number) => string): string {
  if (pageCount <= 1) return "";
  const parts: string[] = [];
  const link = (target: number, label: string, rel?: string, extra = "") =>
    `<a href="${esc(hrefFor(target))}" data-page="${target}"${rel ? ` rel="${rel}"` : ""}${extra}>${label}</a>`;

  parts.push(
    page > 1
      ? link(page - 1, "Prev", "prev", ' data-testid="button-prev-page"')
      : '<span class="is-disabled">Prev</span>',
  );

  let from = Math.max(1, page - 2);
  const to = Math.min(pageCount, from + 4);
  from = Math.max(1, to - 4);
  if (from > 1) {
    parts.push(link(1, "1"));
    if (from > 2) parts.push("<span>…</span>");
  }
  for (let index = from; index <= to; index += 1) {
    parts.push(index === page ? `<span aria-current="page">${index}</span>` : link(index, String(index)));
  }
  if (to < pageCount) {
    if (to < pageCount - 1) parts.push("<span>…</span>");
    parts.push(link(pageCount, String(pageCount)));
  }
  parts.push(
    page < pageCount
      ? link(page + 1, "Next", "next", ' data-testid="button-next-page"')
      : '<span class="is-disabled">Next</span>',
  );

  return `<nav class="pager" aria-label="Pagination" data-inventory-pager>${parts.join("")}</nav>`;
}

/* -------------------------------------------------------------- CTA band --- */

export function ctaBand(headline?: string, blurb?: string): string {
  return `<section class="cta-band">
  <div class="wrap">
    <h2>${esc(headline ?? `Talk to someone about a golf cart today`)}</h2>
    <p>${esc(blurb ?? `${salesEvent.name} pricing is live. Call and a product specialist will check stock across every location while you are on the phone.`)}</p>
    <div class="cta-band__actions">
      <a class="btn btn--primary btn--lg" href="${esc(site.phoneTel)}" data-testid="link-cta-phone">
        <span class="btn__label">Call ${esc(site.phone)}</span>
      </a>
      <a class="btn btn--outline btn--lg" href="${esc(withBase("/inventory/"))}">Browse all inventory</a>
    </div>
    <p class="note">${esc(site.hoursSummary)}</p>
  </div>
</section>`;
}

/** A block of descriptive internal links. No "click here", no stuffing. */
export function relatedLinks(heading: string, links: Array<{ href: string; label: string }>): string {
  if (!links.length) return "";
  return `<section class="section section--tight">
  <div class="wrap">
    <h2>${esc(heading)}</h2>
    <ul class="link-grid">
${links
  .map((link) => `      <li><a href="${esc(withBase(link.href))}">${esc(link.label)}</a></li>`)
  .join("\n")}
    </ul>
  </div>
</section>`;
}

/** Stat strip — real numbers from the snapshot, which is what gets cited. */
export function statStrip(stats: Array<{ value: string; label: string }>): string {
  return `<ul class="stat-strip">
${stats
  .map(
    (stat) =>
      `  <li><span class="stat-strip__value">${esc(stat.value)}</span><span class="stat-strip__label">${esc(stat.label)}</span></li>`,
  )
  .join("\n")}
</ul>`;
}
