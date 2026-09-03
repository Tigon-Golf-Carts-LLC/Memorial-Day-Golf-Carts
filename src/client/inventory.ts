/**
 * Inventory browser (client half of Phase 3).
 *
 * The server pre-renders page 1 of every listing route; this module takes over
 * once it loads and filters, sorts and paginates the whole catalogue in the
 * browser against the static snapshot at public/data/inventory-index.json.
 *
 * Design rules, all of which the tests in tests/filters.test.ts pin:
 *
 *  1. The URL is the single source of truth. `state` is always derived from
 *     `location.search` via `parseQuery`; nothing writes to `state` without
 *     immediately writing the URL, and `popstate` re-derives from scratch.
 *  2. Filtering runs over the normalized snapshot fields using the same
 *     `filterCarts` the prerender used, so hydration cannot change the result.
 *  3. There is no API. The one fetch() in this file reads a static JSON file
 *     from the CDN.
 */

import {
  parseQuery, serializeQuery, filterCarts, sortCarts, facetCountsFor,
  describeFilters, clearFilters, withoutFilter, buildVocabulary, paginate, emptyState,
  MULTI_FIELDS, FIELD_LABELS, FEATURE_LABELS,
  type FilterState, type FilterableCart, type MultiField, type Vocabulary,
  type IgnoredValue, type ActiveFilter,
} from "../lib/filters.ts";
import { PRIMARY_WIDTHS, CART_ASPECT } from "../lib/photo-path.ts";

interface ClientCart extends FilterableCart {
  /** Derivative filename stem, e.g. "denago-nomad-xl-white-hatfield-01-1". */
  imageStem: string;
  imageCount: number;
}

interface IndexPayload {
  updatedAt: string;
  total: number;
  carts: ClientCart[];
}

const root = document.querySelector<HTMLElement>("[data-inventory]");
const grid = document.querySelector<HTMLElement>("[data-inventory-grid]");

if (root) {
  bootstrap(root);
}

function bootstrap(container: HTMLElement): void {
  const PAGE_SIZE = Number(container.dataset.pageSize) || 24;
  const BASE_PATH = container.dataset.basePath || "/inventory/";
  const INDEX_URL = container.dataset.indexUrl || "data/inventory-index.json";
  /** The deployment base path, passed explicitly rather than derived. */
  const SITE_BASE = container.dataset.siteBase || "/";
  /**
   * The page this prerendered file represents.
   *
   * `/inventory/page/3/` is a real file whose HTML already shows page 3. The
   * query string on such a URL carries no `page`, so without this the first
   * render after hydration would snap back to page 1. It seeds the page the
   * same way LOCKED seeds the filters: from the route, not from JavaScript
   * state. Once the shopper interacts, the canonical `?page=` form takes over.
   */
  const ROUTE_PAGE = Math.max(1, Number(container.dataset.routePage) || 1);
  /** The route's own path, without any /page/N/ suffix. */
  const ROUTE_PATH = container.dataset.routePath || BASE_PATH;
  const PHONE = container.dataset.phone || "";
  const PHONE_TEL = container.dataset.phoneTel || "";
  const LOCKED: Partial<Record<MultiField, string[]>> = JSON.parse(container.dataset.locked || "{}");

  const countEl = document.querySelector<HTMLElement>("[data-inventory-count]");
  const pagerEl = document.querySelector<HTMLElement>("[data-inventory-pager]");
  const chipsEl = document.querySelector<HTMLElement>("[data-inventory-chips]");
  const ignoredEl = document.querySelector<HTMLElement>("[data-inventory-ignored]");
  const sortEl = document.querySelector<HTMLSelectElement>("[data-inventory-sort]");
  const searchEl = document.querySelector<HTMLInputElement>("[data-inventory-search]");
  const filtersEl = document.querySelector<HTMLElement>("[data-inventory-filters]");
  const filterToggle = document.querySelector<HTMLElement>("[data-testid='button-open-filters']");

  // Declared before any of them is read: `emptyStateFromUrl()` assigns to
  // `ignored`, so computing the initial state inside `state`'s own initializer
  // put `ignored` in its temporal dead zone and threw on load.
  let carts: ClientCart[] = [];
  let vocab: Vocabulary | undefined;
  let ignored: IgnoredValue[] = [];
  let hydrated = false;
  /** Debounce handle for the price and year range inputs. */
  let rangeTimer = 0;
  let state: FilterState = emptyState();

  /* ------------------------------------------------------------- state */

  /**
   * Derive state from the current URL. The vocabulary is only available after
   * the index loads; before that, values are accepted as written so nothing is
   * dropped and the URL is not rewritten behind the user's back.
   */
  function emptyStateFromUrl(): FilterState {
    const parsed = parseQuery(window.location.search, vocab);
    ignored = parsed.ignored;
    const state = applyLocked(parsed.state);
    // No explicit page in the query means "whatever page this route is".
    if (state.page === 1 && !/[?&]page=/.test(window.location.search) && ROUTE_PAGE > 1) {
      state.page = ROUTE_PAGE;
    }
    return state;
  }

  function applyLocked(next: FilterState): FilterState {
    const out: FilterState = { ...next };
    for (const field of MULTI_FIELDS) {
      const values = LOCKED[field];
      if (values && values.length) out[field] = values.slice();
    }
    return out;
  }

  /**
   * Write the URL from state.
   *
   * The canonical serialization is compared against what is already in the bar,
   * so an interaction that does not change the query (re-checking a box that
   * was already checked, say) does not push a duplicate history entry.
   */
  function writeUrl(push: boolean): void {
    const query = serializeQuery(state, LOCKED);
    const url = ROUTE_PATH + (query ? `?${query}` : "");
    const current = window.location.pathname + window.location.search;
    if (url === current) return;
    // On a prerendered /page/N/ file the initial replaceState would rewrite the
    // path to the route root, which is correct — the query now carries the page
    // — but it must not happen before the first render, or `emptyStateFromUrl`
    // would lose ROUTE_PAGE on a later popstate. Guarded by the caller.
    if (push) window.history.pushState({ inventory: true }, "", url);
    else window.history.replaceState({ inventory: true }, "", url);
  }

  // Now that every binding exists, derive the real state from the URL.
  state = emptyStateFromUrl();

  /** Any navigation through history re-derives everything from the URL. */
  window.addEventListener("popstate", () => {
    state = emptyStateFromUrl();
    syncControls();
    render();
  });

  /* -------------------------------------------------------------- data */

  fetch(INDEX_URL, { credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error(`inventory index ${response.status}`);
      return response.json() as Promise<IndexPayload>;
    })
    .then((payload) => {
      carts = payload.carts || [];
      vocab = buildVocabulary(carts);
      // Re-parse now that unknown values can actually be detected.
      state = emptyStateFromUrl();
      hydrated = true;
      if (grid) grid.setAttribute("data-hydrated", "true");
      syncControls();
      render();
    })
    .catch(() => {
      // Leave the server-rendered first page in place: it is real content, not
      // a shell, so a failed fetch degrades to a working static listing.
      if (grid) grid.setAttribute("data-hydrated", "failed");
    });

  /* ------------------------------------------------------------ render */

  function escapeHtml(value: unknown): string {
    return String(value ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function money(value: number | null): string {
    if (!value || value <= 0) return "Call for Price";
    const hasCents = value % 1 !== 0;
    return "$" + value.toLocaleString("en-US", {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }

  /** Alt text, matching script/lib/images.ts so hydration does not change it. */
  function altFor(cart: ClientCart): string {
    const parts = [cart.year ? String(cart.year) : "", cart.makeLabel, cart.modelLabel].filter(Boolean).join(" ");
    const lifted = cart.features.includes("lifted") ? "lifted " : "";
    const where = cart.city ? ` for sale in ${cart.city}, ${cart.stateCode}` : " for sale";
    const text = `${cart.condition} ${cart.colorLabel.toLowerCase()} ${cart.fuel} ${parts} ${lifted}golf cart${where}`;
    return text.replace(/\s+/g, " ").trim().replace(/^./, (character) => character.toUpperCase());
  }

  /**
   * The card image.
   *
   * The base path and widths come from the same manifest convention the
   * prerender uses, so the srcset in a hydrated card matches the server's.
   */
  function imageHtml(cart: ClientCart, eager: boolean): string {
    const alt = escapeHtml(altFor(cart));
    const loading = eager ? "eager" : "lazy";
    const priority = eager ? ' fetchpriority="high"' : "";
    if (!cart.imageStem) {
      return `<img src="${escapeHtml(asset("images/cart-photo-coming-soon.svg"))}" alt="${alt}" width="800" height="600" loading="${loading}" decoding="async"${priority}>`;
    }
    const base = asset(`images/carts/${cart.imageStem}`);
    const largest = PRIMARY_WIDTHS[PRIMARY_WIDTHS.length - 1];
    const srcset = PRIMARY_WIDTHS.map((width) => `${base}-${width}.webp ${width}w`).join(", ");
    return `<img src="${base}-${largest}.webp" srcset="${escapeHtml(srcset)}" sizes="(min-width: 1200px) 300px, (min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw" alt="${alt}" width="${largest}" height="${Math.round(largest * CART_ASPECT)}" loading="${loading}" decoding="async"${priority}>`;
  }

  /** Resolve a site-root path against the deployment base path. */
  function asset(path: string): string {
    return (SITE_BASE + path.replace(/^\/+/, "")).replace(/\/{2,}/g, "/");
  }

  function cardHtml(cart: ClientCart, eager: boolean): string {
    const href = asset(`golfcart/${cart.slug}/`);
    const monthly = cart.price ? Math.round(cart.price / 48) : null;
    const meta = [
      cart.year ? String(cart.year) : "",
      cart.passengersLabel,
      cart.battery === "lithium" ? "Lithium" : "",
      cart.city ? `${cart.city}, ${cart.stateCode}` : "",
    ].filter(Boolean);

    const badges =
      `<span class="badge badge--${cart.condition === "used" ? "used" : "new"}" data-testid="badge-condition-${escapeHtml(cart.id)}">${cart.condition === "used" ? "Used" : "New"}</span>` +
      `<span class="badge badge--${cart.fuel === "electric" ? "electric" : "gas"}">${cart.fuel === "electric" ? "Electric" : "Gas"}</span>` +
      cart.features
        .filter((feature) => feature === "street-legal" || feature === "lifted")
        .map((feature) => `<span class="badge badge--${feature}">${escapeHtml(FEATURE_LABELS[feature])}</span>`)
        .join("");

    return `<article class="cart-card" data-testid="card-cart-${escapeHtml(cart.id)}">
  <div class="cart-card__media">
    <span class="cart-card__flag">Memorial Day Pricing</span>
    <a href="${escapeHtml(href)}" tabindex="-1" aria-hidden="true">${imageHtml(cart, eager)}</a>
${cart.imageCount > 1 ? `    <span class="cart-card__count">${cart.imageCount} photos</span>` : ""}
  </div>
  <div class="cart-card__body">
    <div class="cart-card__badges">${badges}</div>
    <h3 class="cart-card__title" data-testid="text-title-${escapeHtml(cart.id)}"><a href="${escapeHtml(href)}">${escapeHtml([cart.year, cart.title].filter(Boolean).join(" "))}</a></h3>
    <p class="cart-card__meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</p>
    <div class="cart-card__price-row">
      <span class="cart-card__price" data-testid="text-price-${escapeHtml(cart.id)}">${escapeHtml(money(cart.price))}</span>
${monthly ? `      <span class="cart-card__mo">$${monthly.toLocaleString("en-US")}/mo &middot; 0% APR</span>` : ""}
    </div>
    <div class="cart-card__cta">
      <a class="btn btn--outline btn--sm" href="${escapeHtml(href)}">View Details</a>
      <a class="btn btn--primary btn--sm btn--icon" href="${escapeHtml(PHONE_TEL)}" aria-label="Call ${escapeHtml(PHONE)} about the ${escapeHtml(cart.title)}">Call</a>
    </div>
  </div>
</article>`;
  }

  /** Labels for the chip row, taken from the data rather than hardcoded. */
  function labelMaps(): Partial<Record<MultiField, Record<string, string>>> {
    const maps: Partial<Record<MultiField, Record<string, string>>> = { feature: FEATURE_LABELS };
    const collect = (field: MultiField, get: (cart: ClientCart) => [string, string] | null) => {
      const map: Record<string, string> = {};
      for (const cart of carts) {
        const pair = get(cart);
        if (pair && pair[0] && !map[pair[0]]) map[pair[0]] = pair[1] || pair[0];
      }
      maps[field] = map;
    };
    collect("make", (cart) => [cart.make, cart.makeLabel]);
    collect("model", (cart) => [cart.model, cart.modelLabel]);
    collect("passengers", (cart) => [cart.passengers, cart.passengersLabel]);
    collect("location", (cart) => [cart.location, `${cart.city}, ${cart.stateCode}`]);
    const title = (value: string) => value.replace(/-/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
    for (const field of ["condition", "fuel", "color", "drivetrain", "battery", "tire"] as MultiField[]) {
      const map: Record<string, string> = {};
      for (const cart of carts) {
        const value = String((cart as never as Record<string, unknown>)[field] ?? "");
        if (value && !map[value]) map[value] = field === "drivetrain" ? value.toUpperCase() : field === "battery" && value === "agm" ? "AGM" : title(value);
      }
      maps[field] = map;
    }
    return maps;
  }

  /**
   * The "we ignored X" note.
   *
   * A value in the URL that does not exist in the catalogue is dropped rather
   * than applied, so the grid still shows results — this is what tells the
   * shopper why their link did not do quite what they expected.
   */
  function ignoredHtml(): string {
    if (!ignored.length) return "";
    const label = (field: string) => FIELD_LABELS[field as MultiField] ?? field;
    return (
      `Ignored ` +
      ignored.map((entry) => `<strong>${escapeHtml(label(entry.field))}: ${escapeHtml(entry.value)}</strong>`).join(", ") +
      ` — not in our current stock. Showing everything else that matches.`
    );
  }

  function chipsHtml(active: ActiveFilter[]): string {
    if (!active.length) return "";
    return `<span class="chips__label">Filtering by</span>` +
      active
        .map(
          (entry) =>
            `<button class="chip" type="button" data-chip-field="${escapeHtml(entry.field)}" data-chip-value="${escapeHtml(entry.value)}" aria-label="Remove filter ${escapeHtml(entry.label)}">${escapeHtml(entry.label)}<span aria-hidden="true">&times;</span></button>`,
        )
        .join("") +
      `<button class="chip chip--clear" type="button" data-inventory-reset>Clear all</button>`;
  }

  function emptyStateHtml(active: ActiveFilter[]): string {
    return `<div class="empty-state" data-testid="text-empty-state">
  <h3>No golf carts match those filters</h3>
${active.length
        ? `  <p>You are filtering by ${active.map((entry) => `<strong>${escapeHtml(entry.label)}</strong>`).join(", ")}. Try removing one.</p>`
        : "  <p>There is nothing to show for this view.</p>"}
${ignored.length
        ? `  <p class="note">We ignored ${ignored.map((entry) => `<strong>${escapeHtml(entry.field)}=${escapeHtml(entry.value)}</strong>`).join(", ")} because ${ignored.length === 1 ? "it is" : "they are"} not in our current stock.</p>`
        : ""}
  <div class="empty-state__cta">
    <button class="btn btn--primary" type="button" data-inventory-reset data-testid="button-clear-all-empty">Clear all filters</button>
    <a class="btn btn--outline" href="${escapeHtml(PHONE_TEL)}">Call ${escapeHtml(PHONE)}</a>
  </div>
  <p class="note">We source carts weekly across all locations — call and we will look for your configuration.</p>
</div>`;
  }

  function render(): void {
    if (!hydrated || !grid) return;

    const results = sortCarts(filterCarts(carts, state), state.sort);
    const slice = paginate(results, state.page, PAGE_SIZE);
    // Clamp a page that no longer exists after a filter change.
    if (slice.page !== state.page) {
      state = { ...state, page: slice.page };
      if (ROUTE_PAGE === 1) writeUrl(false);
    }

    const active = describeFilters(chipStateOf(state), labelMaps());

    if (slice.items.length === 0) {
      grid.className = "";
      grid.innerHTML = emptyStateHtml(active);
    } else {
      grid.className = "grid-carts";
      grid.innerHTML = slice.items.map((cart, index) => cardHtml(cart, index === 0)).join("");
    }

    if (countEl) {
      countEl.innerHTML =
        results.length === 0
          ? "No matching carts"
          : `<strong>${results.length.toLocaleString("en-US")}</strong> cart${results.length === 1 ? "" : "s"} &middot; showing ${slice.from}–${slice.to}`;
    }
    if (chipsEl) {
      chipsEl.innerHTML = chipsHtml(active);
      chipsEl.hidden = active.length === 0;
    }
    if (ignoredEl) {
      ignoredEl.innerHTML = ignoredHtml();
      ignoredEl.hidden = ignored.length === 0;
    }
    renderPager(slice.page, slice.pageCount);
    updateFacetCounts();
  }

  /** State with the route's locked values removed — those are not chips. */
  function chipStateOf(source: FilterState): FilterState {
    const out: FilterState = { ...source };
    for (const field of MULTI_FIELDS) {
      if (LOCKED[field]?.length) out[field] = [];
    }
    return out;
  }

  function renderPager(page: number, pageCount: number): void {
    if (!pagerEl) return;
    if (pageCount <= 1) {
      pagerEl.innerHTML = "";
      return;
    }
    const href = (target: number) => {
      const query = serializeQuery({ ...state, page: target }, LOCKED);
      return BASE_PATH + (query ? `?${query}` : "");
    };
    const parts: string[] = [];
    parts.push(
      page > 1
        ? `<a href="${escapeHtml(href(page - 1))}" data-page="${page - 1}" rel="prev" data-testid="button-prev-page">Prev</a>`
        : `<span class="is-disabled">Prev</span>`,
    );
    let from = Math.max(1, page - 2);
    const to = Math.min(pageCount, from + 4);
    from = Math.max(1, to - 4);
    if (from > 1) {
      parts.push(`<a href="${escapeHtml(href(1))}" data-page="1">1</a>`);
      if (from > 2) parts.push("<span>…</span>");
    }
    for (let index = from; index <= to; index += 1) {
      parts.push(
        index === page
          ? `<span aria-current="page">${index}</span>`
          : `<a href="${escapeHtml(href(index))}" data-page="${index}">${index}</a>`,
      );
    }
    if (to < pageCount) {
      if (to < pageCount - 1) parts.push("<span>…</span>");
      parts.push(`<a href="${escapeHtml(href(pageCount))}" data-page="${pageCount}">${pageCount}</a>`);
    }
    parts.push(
      page < pageCount
        ? `<a href="${escapeHtml(href(page + 1))}" data-page="${page + 1}" rel="next" data-testid="button-next-page">Next</a>`
        : `<span class="is-disabled">Next</span>`,
    );
    pagerEl.innerHTML = parts.join("");
  }

  /**
   * Live facet counts.
   *
   * Each facet is counted with every other filter applied but its own
   * selection removed, so the number next to an unchecked box is the count you
   * would get by ticking it. A zero-count option is disabled rather than left
   * selectable into an empty result set.
   */
  function updateFacetCounts(): void {
    const nodes = document.querySelectorAll<HTMLElement>("[data-facet-field]");
    if (!nodes.length || !carts.length) return;

    const cache = new Map<string, Map<string, number>>();
    nodes.forEach((node) => {
      const field = node.dataset.facetField as MultiField;
      const value = node.dataset.facetValue || "";
      if (!field || !value) return;

      if (!cache.has(field)) {
        const counts = new Map<string, number>();
        for (const entry of facetCountsFor(carts, state, field)) counts.set(entry.value, entry.count);
        cache.set(field, counts);
      }
      const count = cache.get(field)!.get(value) ?? 0;
      node.textContent = String(count);

      const label = node.closest("label");
      const input = label?.querySelector<HTMLInputElement>("input[type=checkbox]");
      const checked = Boolean(input?.checked);
      if (label) label.classList.toggle("is-dead", count === 0 && !checked);
      if (input) input.disabled = count === 0 && !checked;
    });
  }

  /* ---------------------------------------------------------- controls */

  /**
   * Push the URL-derived state back into the form controls.
   *
   * This is what makes a reload and a back/forward navigation restore every
   * control: nothing is remembered in JavaScript, it is all read off the URL.
   */
  function syncControls(): void {
    document.querySelectorAll<HTMLInputElement>("[data-filter-field]").forEach((input) => {
      const field = input.dataset.filterField as MultiField;
      const value = input.dataset.filterValue || "";
      const checked = value ? state[field].includes(value) : false;
      input.checked = checked;
      const wrapper = input.closest<HTMLElement>("[data-testid]");
      if (wrapper) wrapper.dataset.state = checked ? "checked" : "unchecked";
    });
    document.querySelectorAll<HTMLInputElement>("[data-filter-range]").forEach((input) => {
      const key = input.dataset.filterRange as "priceMin" | "priceMax" | "yearMin" | "yearMax";
      const value = state[key];
      input.value = value === null ? "" : String(value);
    });
    if (sortEl) sortEl.value = state.sort;
    if (searchEl && searchEl.value !== state.q) searchEl.value = state.q;
  }

  /** Commit a state change: write the URL first, then re-render from it. */
  function commit(next: FilterState, push = true): void {
    state = applyLocked(next);
    writeUrl(push);
    syncControls();
    render();
  }

  document.addEventListener("change", (event) => {
    const target = event.target as HTMLElement | null;
    const input = target?.closest<HTMLInputElement>("[data-filter-field]");
    if (!input) return;
    const field = input.dataset.filterField as MultiField;
    const value = input.dataset.filterValue || "";
    if (!field || !value) return;
    if (LOCKED[field]?.length) {
      input.checked = true;
      return;
    }
    const current = state[field];
    const next = input.checked
      ? current.includes(value) ? current : [...current, value]
      : current.filter((entry) => entry !== value);
    commit({ ...state, [field]: next.sort(), page: 1 });
  });

  document.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target?.dataset.filterRange) return;
    const key = target.dataset.filterRange as "priceMin" | "priceMax" | "yearMin" | "yearMax";
    window.clearTimeout(rangeTimer);
    rangeTimer = window.setTimeout(() => {
      const raw = target.value.trim();
      const parsed = raw === "" ? null : Number(raw.replace(/[^0-9.]/g, ""));
      commit({ ...state, [key]: Number.isFinite(parsed as number) ? (parsed as number) : null, page: 1 });
    }, 350);
  });

  if (sortEl) {
    sortEl.addEventListener("change", () => {
      commit({ ...state, sort: sortEl.value as FilterState["sort"], page: 1 });
    });
  }

  if (searchEl) {
    let timer = 0;
    searchEl.addEventListener("input", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        commit({ ...state, q: searchEl.value.trim(), page: 1 });
      }, 250);
    });
    searchEl.closest("form")?.addEventListener("submit", (event) => event.preventDefault());
  }

  // Clear-all, and per-chip removal. Delegated so it works on re-rendered HTML.
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const reset = target.closest("[data-inventory-reset]");
    if (reset) {
      event.preventDefault();
      commit(clearFilters(state));
      return;
    }

    const chip = target.closest<HTMLElement>("[data-chip-field]");
    if (chip) {
      event.preventDefault();
      const field = chip.dataset.chipField as ActiveFilter["field"];
      commit(withoutFilter(state, field, chip.dataset.chipValue || ""));
      return;
    }

    const page = target.closest<HTMLAnchorElement>("a[data-page]");
    if (page && pagerEl?.contains(page)) {
      event.preventDefault();
      commit({ ...state, page: Number(page.dataset.page) || 1 });
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  if (filterToggle && filtersEl) {
    filterToggle.addEventListener("click", () => {
      const collapsed = filtersEl.dataset.collapsed === "true";
      filtersEl.dataset.collapsed = collapsed ? "false" : "true";
      filterToggle.setAttribute("aria-expanded", collapsed ? "true" : "false");
    });
  }

  // Normalize the URL once on load so a hand-typed or legacy query becomes the
  // canonical form without adding a history entry. A prerendered /page/N/ URL
  // is left alone: it is a real, shareable, crawlable address for that page,
  // and rewriting it would break the back button for anyone who arrived there.
  syncControls();
  if (ROUTE_PAGE === 1) writeUrl(false);
}
