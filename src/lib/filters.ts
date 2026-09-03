/**
 * Inventory filtering.
 *
 * The URL query string is the single source of truth for every filter, the sort
 * order and the page number. This module is the only thing that knows how that
 * query string is spelled, and it is shared by three callers:
 *
 *   - script/prerender.ts, to render the first page of every listing route
 *   - src/client/inventory.ts, to re-filter in the browser
 *   - tests/filters.test.ts, to prove the two agree
 *
 * Because all three go through the same `parseQuery` / `filterCarts` pair, a
 * prerendered page and the hydrated page cannot disagree about what `?condition=new`
 * means. Filtering runs entirely over the committed snapshot — there is no
 * upstream service to forward a filter to, and no response to mis-trust.
 */

import {
  normalizeCondition, normalizeFuel, normalizeColorExact, normalizeColorFamily,
  normalizeMake, normalizeModel, normalizePassengers, normalizeDriveTrain,
  normalizeBatteryType, normalizeTireType, slugKey,
} from "./normalize.ts";

/* ------------------------------------------------------------------ types --- */

/** A cart as it appears in the snapshot, in the fields filtering reads. */
export interface FilterableCart {
  id: string;
  slug: string;
  title: string;
  condition: string;         // "new" | "used"
  fuel: string;              // "electric" | "gas"
  make: string;              // "club_car"
  makeLabel: string;
  model: string;             // "precedent"
  modelLabel: string;
  color: string;             // family: "black"
  colorExact: string;        // "matte-black"
  colorLabel: string;
  passengers: string;        // "4-passenger"
  drivetrain: string;        // "2x4" | "4x4"
  battery: string;           // "lithium" | "lead" | "agm"
  tire: string;              // "all-terrain" | "street"
  location: string;          // store slug
  features: string[];        // "street-legal" | "lifted" | ...
  price: number | null;
  year: number | null;
  search: string;            // pre-lowercased haystack
  [key: string]: unknown;
}

export type SortKey = "featured" | "price-asc" | "price-desc" | "year-desc" | "year-asc";

export const SORT_KEYS: SortKey[] = ["featured", "price-asc", "price-desc", "year-desc", "year-asc"];

/** The multi-select facets, in the fixed order they are serialized. */
export const MULTI_FIELDS = [
  "condition", "fuel", "make", "model", "color",
  "passengers", "drivetrain", "battery", "tire", "location", "feature",
] as const;

export type MultiField = (typeof MULTI_FIELDS)[number];

export interface FilterState {
  condition: string[];
  fuel: string[];
  make: string[];
  model: string[];
  color: string[];
  passengers: string[];
  drivetrain: string[];
  battery: string[];
  tire: string[];
  location: string[];
  feature: string[];
  priceMin: number | null;
  priceMax: number | null;
  yearMin: number | null;
  yearMax: number | null;
  q: string;
  sort: SortKey;
  page: number;
}

/** The set of values that actually exist in the snapshot, per facet. */
export type Vocabulary = Record<MultiField, Set<string>>;

export interface IgnoredValue {
  field: MultiField;
  value: string;
  reason: "unknown-value";
}

export interface ParseResult {
  state: FilterState;
  /** Values that parsed cleanly but do not exist in the data. */
  ignored: IgnoredValue[];
}

/** The features a cart can carry, as filterable values. */
export const FEATURE_KEYS = ["street-legal", "lifted", "hitch", "sound-system", "extended-top"] as const;

export const FEATURE_LABELS: Record<string, string> = {
  "street-legal": "Street Legal",
  lifted: "Lifted",
  hitch: "Tow Hitch",
  "sound-system": "Sound System",
  "extended-top": "Extended Top",
};

export const FIELD_LABELS: Record<MultiField, string> = {
  condition: "Condition",
  fuel: "Power",
  make: "Brand",
  model: "Model",
  color: "Color",
  passengers: "Passengers",
  drivetrain: "Drivetrain",
  battery: "Battery",
  tire: "Tires",
  location: "Location",
  feature: "Features",
};

/** Per-field normalizer, applied to both snapshot values and URL values. */
const NORMALIZERS: Record<MultiField, (value: unknown) => string> = {
  condition: (value) => normalizeCondition(value) ?? "",
  fuel: (value) => normalizeFuel(value) ?? "",
  make: normalizeMake,
  model: normalizeModel,
  // A colour param may name either a family ("black") or an exact colour
  // ("matte-black"); both are kept as written after normalization, and
  // `cartMatchesColor` accepts either against a cart.
  color: (value) => normalizeColorExact(value),
  passengers: normalizePassengers,
  drivetrain: normalizeDriveTrain,
  battery: normalizeBatteryType,
  tire: normalizeTireType,
  location: slugKey,
  feature: slugKey,
};

/* ------------------------------------------------------------------ state --- */

export function emptyState(): FilterState {
  return {
    condition: [], fuel: [], make: [], model: [], color: [],
    passengers: [], drivetrain: [], battery: [], tire: [], location: [], feature: [],
    priceMin: null, priceMax: null, yearMin: null, yearMax: null,
    q: "", sort: "featured", page: 1,
  };
}

/** True when no filter, search or non-default sort is active. */
export function isPristine(state: FilterState): boolean {
  return (
    MULTI_FIELDS.every((field) => state[field].length === 0) &&
    state.priceMin === null && state.priceMax === null &&
    state.yearMin === null && state.yearMax === null &&
    !state.q && state.sort === "featured" && state.page === 1
  );
}

/** True when at least one *filter* (not sort or page) is active. */
export function hasActiveFilters(state: FilterState): boolean {
  return (
    MULTI_FIELDS.some((field) => state[field].length > 0) ||
    state.priceMin !== null || state.priceMax !== null ||
    state.yearMin !== null || state.yearMax !== null ||
    Boolean(state.q)
  );
}

/** Build the vocabulary of values that genuinely exist in a cart list. */
export function buildVocabulary(carts: FilterableCart[]): Vocabulary {
  const vocab = {} as Vocabulary;
  for (const field of MULTI_FIELDS) vocab[field] = new Set<string>();
  for (const cart of carts) {
    if (cart.condition) vocab.condition.add(cart.condition);
    if (cart.fuel) vocab.fuel.add(cart.fuel);
    if (cart.make) vocab.make.add(cart.make);
    if (cart.model) vocab.model.add(cart.model);
    // Both the family and the exact colour are valid URL values.
    if (cart.color) vocab.color.add(cart.color);
    if (cart.colorExact) vocab.color.add(cart.colorExact);
    if (cart.passengers) vocab.passengers.add(cart.passengers);
    if (cart.drivetrain) vocab.drivetrain.add(cart.drivetrain);
    if (cart.battery) vocab.battery.add(cart.battery);
    if (cart.tire) vocab.tire.add(cart.tire);
    if (cart.location) vocab.location.add(cart.location);
    for (const feature of cart.features || []) vocab.feature.add(feature);
  }
  return vocab;
}

/* ------------------------------------------------------------------ parse --- */

/**
 * Read every value for a multi-select param.
 *
 * Both spellings round-trip: repeated params (`?color=black&color=green`) and
 * a comma-joined single param (`?color=black,green`). Commas are split in
 * every value, not just a lone one, so `?color=black,green&color=red` works.
 */
function readList(params: URLSearchParams, name: string): string[] {
  const out: string[] = [];
  for (const raw of params.getAll(name)) {
    for (const part of String(raw).split(",")) {
      const value = part.trim();
      if (value) out.push(value);
    }
  }
  return out;
}

function readInt(params: URLSearchParams, ...names: string[]): number | null {
  for (const name of names) {
    const raw = params.get(name);
    if (raw === null || raw === "") continue;
    const value = Number(String(raw).replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * Parse a query string into filter state.
 *
 * Values are normalized with the same functions the snapshot was built with, so
 * `?condition=Pre-Owned` and `?condition=used` are the same query. When a
 * vocabulary is supplied, values that normalize cleanly but do not exist in the
 * data are dropped and reported in `ignored` rather than being applied — an
 * unknown value must not silently return zero results.
 *
 * Aliases for the legacy `isNew=true` / `makes=` parameter scheme are accepted
 * so old links and bookmarks keep working.
 */
export function parseQuery(search: string | URLSearchParams, vocab?: Vocabulary): ParseResult {
  const params = typeof search === "string"
    ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    : search;
  const state = emptyState();
  const ignored: IgnoredValue[] = [];

  // Legacy boolean aliases from the previous implementation.
  const legacy: Array<[string, MultiField, string]> = [
    ["isNew", "condition", "new"],
    ["isUsed", "condition", "used"],
    ["isElectric", "fuel", "electric"],
    ["isGas", "fuel", "gas"],
    ["isStreetLegal", "feature", "street-legal"],
    ["isLifted", "feature", "lifted"],
  ];

  const aliases: Record<MultiField, string[]> = {
    condition: ["condition"],
    fuel: ["fuel", "power"],
    make: ["make", "makes", "brand"],
    model: ["model", "models"],
    color: ["color", "colors", "colour", "colours"],
    passengers: ["passengers", "seats", "passenger"],
    drivetrain: ["drivetrain", "driveTrain", "drive"],
    battery: ["battery", "batteryType"],
    tire: ["tire", "tires", "tireType"],
    location: ["location", "locations", "storeIds", "store"],
    feature: ["feature", "features"],
  };

  for (const field of MULTI_FIELDS) {
    const raw: string[] = [];
    for (const name of aliases[field]) raw.push(...readList(params, name));
    for (const [param, target, value] of legacy) {
      if (target === field && params.get(param) === "true") raw.push(value);
    }

    const normalize = NORMALIZERS[field];
    const accepted: string[] = [];
    const unknown: string[] = [];

    for (const value of raw) {
      const key = normalize(value);
      // A value that does not normalize at all is a malformed param: drop it
      // silently, there is nothing meaningful to report to a shopper.
      if (!key) continue;
      if (vocab && !vocab[field].has(key)) {
        if (!unknown.includes(key)) unknown.push(key);
        continue;
      }
      if (!accepted.includes(key)) accepted.push(key);
    }

    // Report unknown values so the UI can say "we ignored X" instead of showing
    // an unexplained empty grid.
    for (const value of unknown) ignored.push({ field, value, reason: "unknown-value" });
    state[field] = accepted.sort();
  }

  state.priceMin = readInt(params, "priceMin", "minPrice");
  state.priceMax = readInt(params, "priceMax", "maxPrice");
  state.yearMin = readInt(params, "yearMin", "minYear");
  state.yearMax = readInt(params, "yearMax", "maxYear");

  // A reversed range is a typo, not an empty result set.
  if (state.priceMin !== null && state.priceMax !== null && state.priceMin > state.priceMax) {
    [state.priceMin, state.priceMax] = [state.priceMax, state.priceMin];
  }
  if (state.yearMin !== null && state.yearMax !== null && state.yearMin > state.yearMax) {
    [state.yearMin, state.yearMax] = [state.yearMax, state.yearMin];
  }

  state.q = (params.get("q") || params.get("search") || params.get("searchText") || "").trim();

  const sort = params.get("sort");
  if (sort && (SORT_KEYS as string[]).includes(sort)) {
    state.sort = sort as SortKey;
  } else if (params.get("priceSortASC") === "true") {
    state.sort = "price-asc";
  } else if (params.get("priceSortASC") === "false") {
    state.sort = "price-desc";
  }

  const page = readInt(params, "page");
  state.page = page && page >= 1 ? Math.floor(page) : 1;

  return { state, ignored };
}

/* -------------------------------------------------------------- serialize --- */

/**
 * Serialize filter state back to a canonical query string.
 *
 * Canonical means: fields in `MULTI_FIELDS` order, values sorted within each
 * field, defaults omitted. That is what makes serialize → parse → serialize
 * idempotent, which in turn is what lets the client compare the URL it would
 * write against the one already in the bar and skip a redundant history entry.
 *
 * `locked` values belong to the route itself (`/inventory/new/` locks
 * `condition=new`) and are omitted so the path is not duplicated in the query.
 */
export function serializeQuery(state: FilterState, locked: Partial<Record<MultiField, string[]>> = {}): string {
  const params = new URLSearchParams();

  for (const field of MULTI_FIELDS) {
    const lockedValues = locked[field] || [];
    const values = [...state[field]].filter((value) => !lockedValues.includes(value)).sort();
    for (const value of values) params.append(field, value);
  }
  if (state.priceMin !== null) params.set("priceMin", String(state.priceMin));
  if (state.priceMax !== null) params.set("priceMax", String(state.priceMax));
  if (state.yearMin !== null) params.set("yearMin", String(state.yearMin));
  if (state.yearMax !== null) params.set("yearMax", String(state.yearMax));
  if (state.q) params.set("q", state.q);
  if (state.sort && state.sort !== "featured") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));

  return params.toString();
}

/* ----------------------------------------------------------------- filter --- */

/** A colour param matches a cart by either its family or its exact colour. */
function cartMatchesColor(cart: FilterableCart, values: string[]): boolean {
  return values.includes(cart.color) || values.includes(cart.colorExact);
}

/** Does one cart satisfy every active filter? */
export function cartMatches(cart: FilterableCart, state: FilterState): boolean {
  // Multi-select semantics: OR within a facet, AND across facets.
  if (state.condition.length && !state.condition.includes(cart.condition)) return false;
  if (state.fuel.length && !state.fuel.includes(cart.fuel)) return false;
  if (state.make.length && !state.make.includes(cart.make)) return false;
  if (state.model.length && !state.model.includes(cart.model)) return false;
  if (state.color.length && !cartMatchesColor(cart, state.color)) return false;
  if (state.passengers.length && !state.passengers.includes(cart.passengers)) return false;
  if (state.drivetrain.length && !state.drivetrain.includes(cart.drivetrain)) return false;
  if (state.battery.length && !state.battery.includes(cart.battery)) return false;
  if (state.tire.length && !state.tire.includes(cart.tire)) return false;
  if (state.location.length && !state.location.includes(cart.location)) return false;
  // Features are conjunctive: asking for lifted AND street legal means both.
  if (state.feature.length && !state.feature.every((feature) => cart.features.includes(feature))) return false;

  if (state.priceMin !== null && (cart.price === null || cart.price < state.priceMin)) return false;
  if (state.priceMax !== null && (cart.price === null || cart.price > state.priceMax)) return false;
  if (state.yearMin !== null && (cart.year === null || cart.year < state.yearMin)) return false;
  if (state.yearMax !== null && (cart.year === null || cart.year > state.yearMax)) return false;

  if (state.q) {
    const needle = state.q.toLowerCase();
    // Every whitespace-separated term must appear somewhere in the haystack.
    for (const term of needle.split(/\s+/).filter(Boolean)) {
      if (!cart.search.includes(term)) return false;
    }
  }
  return true;
}

/** Every cart that satisfies the state, in snapshot order. */
export function filterCarts(carts: FilterableCart[], state: FilterState): FilterableCart[] {
  return carts.filter((cart) => cartMatches(cart, state));
}

/* ------------------------------------------------------------------- sort --- */

export function sortCarts(carts: FilterableCart[], sort: SortKey): FilterableCart[] {
  const list = [...carts];
  // Ties break on id so the order is stable across runs and matches the client.
  const byId = (a: FilterableCart, b: FilterableCart) => String(a.id).localeCompare(String(b.id));
  switch (sort) {
    case "price-asc":
      return list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || byId(a, b));
    case "price-desc":
      return list.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity) || byId(a, b));
    case "year-desc":
      return list.sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity) || byId(a, b));
    case "year-asc":
      return list.sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity) || byId(a, b));
    default:
      return list;
  }
}

/* ----------------------------------------------------------------- facets --- */

export interface FacetCount {
  value: string;
  label: string;
  count: number;
}

/**
 * Facet counts for one field, computed over the result set with every *other*
 * filter applied but this field's own selection removed.
 *
 * Counting with the field's own selection still applied would show 0 next to
 * every unselected option in the same facet, which makes a multi-select
 * impossible to extend. Excluding it gives the count you would get by adding
 * that value to the current selection — which is what the number next to a
 * checkbox should mean.
 */
export function facetCountsFor(
  carts: FilterableCart[],
  state: FilterState,
  field: MultiField,
  labels: Record<string, string> = {},
): FacetCount[] {
  const probe: FilterState = { ...state, [field]: [] } as FilterState;
  const pool = carts.filter((cart) => cartMatches(cart, probe));
  const counts = new Map<string, number>();

  for (const cart of pool) {
    if (field === "feature") {
      for (const feature of cart.features) counts.set(feature, (counts.get(feature) ?? 0) + 1);
      continue;
    }
    if (field === "color") {
      // Count against the family, which is what the UI offers as an option.
      if (cart.color) counts.set(cart.color, (counts.get(cart.color) ?? 0) + 1);
      continue;
    }
    const value = cart[field] as string;
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: labels[value] || value, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Facet counts for every field at once. */
export function allFacetCounts(
  carts: FilterableCart[],
  state: FilterState,
  labels: Partial<Record<MultiField, Record<string, string>>> = {},
): Record<MultiField, FacetCount[]> {
  const out = {} as Record<MultiField, FacetCount[]>;
  for (const field of MULTI_FIELDS) {
    out[field] = facetCountsFor(carts, state, field, labels[field] || {});
  }
  return out;
}

/* ------------------------------------------------------------ description --- */

export interface ActiveFilter {
  field: MultiField | "priceMin" | "priceMax" | "yearMin" | "yearMax" | "q";
  value: string;
  label: string;
}

/**
 * The active filters as human-readable chips.
 *
 * Phase 3 requires the empty state to *name* what is filtered rather than just
 * saying "no results", so this is what both the chip row and the empty state
 * read from.
 */
export function describeFilters(
  state: FilterState,
  labels: Partial<Record<MultiField, Record<string, string>>> = {},
): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  for (const field of MULTI_FIELDS) {
    for (const value of state[field]) {
      const label = labels[field]?.[value] || value.replace(/-/g, " ").replace(/_/g, " ");
      out.push({ field, value, label: `${FIELD_LABELS[field]}: ${label}` });
    }
  }
  const money = (value: number) => `$${value.toLocaleString("en-US")}`;
  if (state.priceMin !== null) out.push({ field: "priceMin", value: String(state.priceMin), label: `Price from ${money(state.priceMin)}` });
  if (state.priceMax !== null) out.push({ field: "priceMax", value: String(state.priceMax), label: `Price up to ${money(state.priceMax)}` });
  if (state.yearMin !== null) out.push({ field: "yearMin", value: String(state.yearMin), label: `Year from ${state.yearMin}` });
  if (state.yearMax !== null) out.push({ field: "yearMax", value: String(state.yearMax), label: `Year up to ${state.yearMax}` });
  if (state.q) out.push({ field: "q", value: state.q, label: `Search: “${state.q}”` });
  return out;
}

/** Remove one filter value from state, returning a new state. */
export function withoutFilter(state: FilterState, field: ActiveFilter["field"], value: string): FilterState {
  const next: FilterState = { ...state, page: 1 };
  if (field === "q") next.q = "";
  else if (field === "priceMin" || field === "priceMax" || field === "yearMin" || field === "yearMax") next[field] = null;
  else next[field] = state[field].filter((entry) => entry !== value);
  return next;
}

/** Clear every filter, keeping the sort order. */
export function clearFilters(state: FilterState): FilterState {
  return { ...emptyState(), sort: state.sort };
}

/* --------------------------------------------------------------- paginate --- */

export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  from: number;
  to: number;
}

export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    page: current,
    pageCount,
    pageSize,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
  };
}
