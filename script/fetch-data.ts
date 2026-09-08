#!/usr/bin/env node
/**
 * Phase 2 — build-time data snapshot.
 *
 * Pulls every dataset the app previously read from its own API — inventory,
 * models, categories, locations, guide/blog posts, testimonials — normalizes
 * it, and writes plain minified JSON:
 *
 *   src/data/       imported at build time by prerender/SEO/sitemap
 *   public/data/    fetched at runtime by the inventory browser (static files,
 *                   not an API — no server code is involved)
 *
 * Failure policy (Phase 2):
 *   - The DMS being unreachable never writes an empty or partial snapshot over
 *     a good one. The committed snapshot is the fallback and its use is logged
 *     loudly on stderr.
 *   - With no usable fallback, the script fails loudly and non-zero.
 *   - `--require-live` refuses the fallback outright, for deploys where stale
 *     inventory is not acceptable.
 *
 * Usage:
 *   node script/fetch-data.ts                 # live DMS pull, fallback allowed
 *   node script/fetch-data.ts --require-live  # live or bust
 *   node script/fetch-data.ts --offline       # use the committed snapshot only
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { getAllCarts, getStores, type DmsStore } from "./lib/dms.ts";
import { toSlugPart, buildCartTitle, isoStamp } from "./lib/util.ts";
import { locations as locationSeed, toStateCode } from "../src/config/locations.ts";
import { storeDisplayName, DMS_BASE_URL } from "../src/config/site.ts";
import { guides } from "../src/config/guides.ts";
import { testimonials } from "../src/config/testimonials.ts";
import {
  normalizeCondition, normalizeFuel, normalizeColorExact, normalizeColorFamily,
  normalizeMake, normalizeModel, normalizePassengers, passengerLabel,
  normalizeDriveTrain, normalizeBatteryType, normalizeTireType,
  normalizeYear, normalizePrice,
} from "../src/lib/normalize.ts";
import { FEATURE_KEYS, FEATURE_LABELS } from "../src/lib/filters.ts";
import { photoStem } from "../src/lib/photo-path.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DATA = resolve(root, "src/data");
const PUBLIC_DATA = resolve(root, "public/data");
const SNAPSHOT = resolve(SRC_DATA, "snapshot.json");

const requireLive = process.argv.includes("--require-live");
const offline = process.argv.includes("--offline");
/**
 * `--fixture` normalizes a raw-DMS-shaped fixture instead of calling the API.
 * It exists so the committed fallback snapshot is produced by exactly the same
 * normalization path a live fetch uses, and so the site can be developed with
 * no network. It is never used by the deploy workflow.
 */
const useFixture = process.argv.includes("--fixture");
const FIXTURE = resolve(root, "assets-raw/dms-fixture.json");

/**
 * Publishability gates, both configurable from the workflow env.
 *
 * `REQUIRE_RFS` is the one that matters. The DMS marks most records
 * rfsStatus.isRFS false, and on the sister site that flag was decisive: those
 * records were said to carry an internal figure rather than an asking price,
 * so publishing them put wrong prices on the floor. Whether that is still true
 * of this dealer group's data is a business question, not a code question — so
 * it is a switch, defaulting to the safe answer, and the funnel report below
 * prints exactly what flipping it would publish.
 *
 *   REQUIRE_RFS=false     publish records regardless of the isRFS flag
 *   REQUIRE_PHOTOS=false  publish records with no photograph (not advised:
 *                         they render behind a placeholder)
 *   REQUIRE_PRICE=true    additionally require a positive resolved price
 */
const REQUIRE_RFS = process.env.REQUIRE_RFS !== "false";
const REQUIRE_PHOTOS = process.env.REQUIRE_PHOTOS !== "false";
const REQUIRE_PRICE = process.env.REQUIRE_PRICE === "true";

/**
 * Fields present on the raw DMS record (or the previous snapshot shape) that
 * the frontend never reads, and which this script deliberately drops.
 * Reported at the end of every run so the list stays honest.
 */
const DROPPED_FIELDS = [
  "rawPricing — every money-shaped DMS field including internal invoiceNo and cost figures; the site publishes one resolved price",
  "inventoryState — 12 internal DMS lifecycle flags (isRFS, isOnLot, isDraft, needOnWebsite…); used only to decide publishability, never rendered",
  "status — internal DMS lifecycle string (retail / work_in_progress / boneyard)",
  "isElectric, isUsed — raw booleans superseded by the normalized `fuel` and `condition` enums",
  "serial — internal stock number, not a buyer-facing specification",
  "country — constant \"USA\" on every record; lives in src/config/site.ts instead",
  "locationDescription — empty on every record",
  "engine.horsepower, engine.stroke — empty on every record",
  "hasPhotos — derivable from images.length",
  "internalCartImageUrls — private DMS photography, never requested",
  "cartType/cartAttributes wrappers — flattened into top-level normalized fields",
  "storeMongoId, inDms (stores) — internal DMS identifiers and a build-time flag",
];

/* --------------------------------------------------------------- stores --- */

/** Merge live DMS store records onto the geo seed, matching on city + state. */
function mergeStores(dmsStores: DmsStore[] | null | undefined) {
  const byCity = new Map<string, DmsStore>();
  for (const store of dmsStores ?? []) {
    const key = `${toSlugPart(store?.address?.city)}|${toSlugPart(store?.address?.state)}`;
    if (!byCity.has(key)) byCity.set(key, store);
  }

  const merged = locationSeed.map((seed) => {
    const key = `${toSlugPart(seed.city)}|${toSlugPart(seed.state)}`;
    const store = byCity.get(key);
    byCity.delete(key);
    return {
      slug: seed.slug,
      city: seed.city,
      state: seed.state,
      stateCode: seed.stateCode,
      lat: seed.lat,
      lng: seed.lng,
      county: seed.county,
      region: seed.region,
      serviceArea: seed.serviceArea,
      keywords: seed.keywords,
      storeId: store?.storeId ?? null,
      name: storeDisplayName(seed.city, seed.state),
      address1: store?.address?.address1 ?? "",
      address2: store?.address?.address2 ?? "",
      postalCode: store?.address?.postalCode ?? "",
      cartCount: 0,
    };
  });

  // Any DMS store with no seed entry still gets a page rather than being dropped.
  for (const store of byCity.values()) {
    const city = store?.address?.city || "";
    const state = store?.address?.state || "";
    if (!city) continue;
    merged.push({
      slug: toSlugPart(`${city}-${state}`) || toSlugPart(store.storeId),
      city,
      state,
      stateCode: toStateCode(state),
      lat: null as unknown as number,
      lng: null as unknown as number,
      county: "",
      region: state,
      serviceArea: [],
      keywords: [`${city} golf carts`, `${city} ${state} golf cart dealer`],
      storeId: store?.storeId ?? null,
      name: storeDisplayName(city, state),
      address1: store?.address?.address1 ?? "",
      address2: store?.address?.address2 ?? "",
      postalCode: store?.address?.postalCode ?? "",
      cartCount: 0,
    });
  }

  return merged;
}

/* ---------------------------------------------------------- publishable --- */

/**
 * Statuses the DMS uses for units that are not sellable retail stock.
 * boneyard / permanent_boneyard are parts and scrap carts; work_in_progress
 * units are still being built, and their `retailPrice` is an internal figure
 * rather than an asking price.
 */
const NON_RETAIL_STATUS = new Set(["boneyard", "permanent_boneyard", "work_in_progress"]);

/** Public photographs on a raw DMS record. `internalCartImageUrls` is private. */
function publicImages(raw: any): string[] {
  return (Array.isArray(raw?.imageUrls) ? raw.imageUrls : []).filter(
    (name: unknown) => typeof name === "string" && name.trim(),
  );
}

/**
 * Whether a raw DMS record belongs on the website.
 *
 * The two decisive rules come from the dealership:
 *   isRFS  — "ready for sale". A record with rfsStatus.isRFS false carries an
 *            internal figure rather than an asking price and must not publish.
 *   photos — a cart with no public photograph is not listed at all, rather than
 *            listed behind a placeholder.
 */
function isSellable(raw: any): boolean {
  if (REQUIRE_RFS && raw?.rfsStatus?.isRFS !== true) return false;
  if (REQUIRE_PHOTOS && publicImages(raw).length === 0) return false;
  if (REQUIRE_PRICE && resolvePrice(raw) === null) return false;
  // These four are never optional: a scrap cart, a cart in the service bay or
  // one that is not in stock is not for sale at any price.
  const status = String(raw?.status ?? "").toLowerCase();
  if (NON_RETAIL_STATUS.has(status)) return false;
  if (raw?.isInBoneyard === true) return false;
  if (raw?.isService === true) return false;
  if (raw?.isInStock === false) return false;
  return true;
}

/** Why a record was held back, for the snapshot's audit block. */
function exclusionReason(raw: any): string {
  if (REQUIRE_RFS && raw?.rfsStatus?.isRFS !== true) return "not ready for sale (isRFS false)";
  if (REQUIRE_PHOTOS && publicImages(raw).length === 0) return "no photograph";
  if (REQUIRE_PRICE && resolvePrice(raw) === null) return "no price";
  return `status: ${raw?.status ?? "unknown"}`;
}

/**
 * What each candidate rule set would publish, printed on every run.
 *
 * This exists because the gap between "records the DMS returns" and "carts on
 * the site" was 1,076 records and there was no way to see inside it without
 * reading code. Anyone can now read the funnel off the build log and decide
 * whether the isRFS gate is earning its place.
 */
function reportFunnel(rawCarts: any[]): void {
  const alive = (raw: any) => {
    const status = String(raw?.status ?? "").toLowerCase();
    return (
      !NON_RETAIL_STATUS.has(status) &&
      raw?.isInBoneyard !== true &&
      raw?.isService !== true &&
      raw?.isInStock !== false
    );
  };

  const rfs = (raw: any) => raw?.rfsStatus?.isRFS === true;
  const photos = (raw: any) => publicImages(raw).length > 0;
  const priced = (raw: any) => resolvePrice(raw) !== null;

  const count = (predicate: (raw: any) => boolean) => rawCarts.filter(predicate).length;
  const pad = (value: number) => String(value).padStart(6);

  process.stderr.write(`\n${"=".repeat(72)}\nPUBLISHABILITY FUNNEL — ${rawCarts.length} records returned by the DMS\n${"=".repeat(72)}\n`);
  process.stderr.write(`  ${pad(count(() => true))}  returned by /get-carts\n`);
  process.stderr.write(`  ${pad(count(alive))}  in stock, not boneyard/service/WIP\n`);
  process.stderr.write(`  ${pad(count((r) => alive(r) && photos(r)))}  ...and photographed\n`);
  process.stderr.write(`  ${pad(count((r) => alive(r) && photos(r) && priced(r)))}  ...and priced\n`);
  process.stderr.write(`  ${pad(count((r) => alive(r) && photos(r) && priced(r) && rfs(r)))}  ...and flagged ready for sale (isRFS)\n`);

  process.stderr.write(`\n  What each rule set would publish:\n`);
  process.stderr.write(`  ${pad(count((r) => alive(r) && photos(r) && rfs(r)))}  REQUIRE_RFS=true   (current default)\n`);
  process.stderr.write(`  ${pad(count((r) => alive(r) && photos(r)))}  REQUIRE_RFS=false\n`);
  process.stderr.write(`  ${pad(count((r) => alive(r) && photos(r) && priced(r)))}  REQUIRE_RFS=false REQUIRE_PRICE=true\n`);

  // The decisive question about the excluded group: do those records carry a
  // real asking price, or an internal figure? Print the evidence.
  const held = rawCarts.filter((r) => alive(r) && photos(r) && !rfs(r));
  if (held.length) {
    const prices = held.map(resolvePrice).filter((p): p is number => p !== null).sort((a, b) => a - b);
    const statuses = new Map<string, number>();
    for (const raw of held) {
      const key = String(raw?.status ?? "(none)");
      statuses.set(key, (statuses.get(key) ?? 0) + 1);
    }
    const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
    process.stderr.write(
      `\n  The ${held.length} photographed, in-stock records held back by isRFS:\n` +
        `    ${prices.length} of ${held.length} carry a positive price\n`,
    );
    if (prices.length) {
      process.stderr.write(
        `    price range   ${money(prices[0])} – ${money(prices[prices.length - 1])}\n` +
          `    median        ${money(prices[Math.floor(prices.length / 2)])}\n` +
          `    under $1,000  ${prices.filter((p) => p < 1000).length}   (a low count suggests real asking prices)\n` +
          `    over $25,000  ${prices.filter((p) => p > 25000).length}   (a high count suggests internal figures)\n`,
      );
    }
    process.stderr.write(
      `    status values: ${[...statuses.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", ")}\n`,
    );
    process.stderr.write(
      `\n  Set REQUIRE_RFS=false in the workflow env to publish these.\n` +
        `  Compare the price range above against what these carts actually sell for\n` +
        `  before doing so — that is the whole risk of the change.\n`,
    );
  }
  process.stderr.write(`${"=".repeat(72)}\n`);
}

/**
 * The price the site publishes for a cart.
 *
 * `retailPrice` is the documented field. The fallbacks cover records where it
 * is missing or zero, in the order a dealership would advertise them.
 */
function resolvePrice(raw: any): number | null {
  const candidates = [
    raw?.retailPrice, raw?.salePrice, raw?.webPrice, raw?.internetPrice,
    raw?.listPrice, raw?.askingPrice, raw?.pricing?.retailPrice,
    raw?.pricing?.salePrice, raw?.pricing?.price, raw?.price,
  ];
  for (const value of candidates) {
    const price = normalizePrice(value);
    if (price !== null) return price;
  }
  return null;
}

/* ------------------------------------------------------------ normalize --- */

/**
 * Flatten a raw DMS cart into the normalized shape every template, feed and
 * filter consumes. Every enum goes through src/lib/normalize.ts, so a value in
 * the snapshot is always directly comparable to a value parsed from a URL.
 */
function normalizeCart(raw: any, storeById: Map<string, any>) {
  const makeLabel = String(raw?.cartType?.make ?? "").trim();
  const modelLabel = String(raw?.cartType?.model ?? "").trim();
  const attributes = raw?.cartAttributes ?? {};
  const colorLabel = String(attributes?.cartColor ?? "").trim();

  const storeId = raw?.cartLocation?.locationId || raw?.cartLocation?.latestStoreId || "";
  const store = storeById.get(storeId) ?? null;

  const images = [...new Set(publicImages(raw).map((name) => name.trim()))];

  const features: string[] = [];
  if (raw?.title?.isStreetLegal === true) features.push("street-legal");
  if (attributes?.isLifted === true) features.push("lifted");
  if (attributes?.hasHitch === true) features.push("hitch");
  if (attributes?.hasSoundSystem === true) features.push("sound-system");
  if (attributes?.hasExtendedTop === true) features.push("extended-top");

  const condition = normalizeCondition(raw?.isUsed === true ? "used" : "new") ?? "new";
  const fuel = normalizeFuel(raw?.isElectric === true ? "electric" : "gas") ?? "gas";
  const passengers = normalizePassengers(attributes?.passengers);
  const battery = normalizeBatteryType(raw?.battery?.type);

  const engineMake = String(raw?.engine?.make ?? "").trim();

  return {
    id: String(raw._id),
    slug: "",
    title: buildCartTitle(makeLabel, modelLabel, colorLabel),
    year: normalizeYear(raw?.cartType?.year),
    price: resolvePrice(raw),

    condition,
    fuel,
    make: normalizeMake(makeLabel),
    makeLabel,
    model: normalizeModel(modelLabel),
    modelLabel,
    color: normalizeColorFamily(colorLabel),
    colorExact: normalizeColorExact(colorLabel),
    colorLabel,
    passengers,
    passengersLabel: passengers ? passengerLabel(passengers) : "",
    drivetrain: normalizeDriveTrain(attributes?.driveTrain),
    battery,
    tire: normalizeTireType(attributes?.tireType),
    features,

    seatColor: String(attributes?.seatColor ?? "").trim(),
    tireRimSize: String(attributes?.tireRimSize ?? "").trim(),
    vin: String(raw?.vinNo ?? "").trim(),
    odometer: Number.isFinite(Number(raw?.odometer)) && Number(raw?.odometer) > 0 ? Number(raw.odometer) : null,
    hours: Number.isFinite(Number(raw?.hour)) && Number(raw?.hour) > 0 ? Number(raw.hour) : null,
    warranty: String(raw?.warrantyLength ?? "").trim(),

    batterySpec: raw?.battery
      ? {
          type: battery,
          typeLabel: String(raw.battery.type ?? "").trim(),
          // The DMS carries a battery brand sharing the parent group's name. It
          // is omitted rather than renamed: dropping a field is accurate,
          // substituting a different manufacturer would not be.
          brand: /tigon/i.test(String(raw.battery.brand ?? "")) ? "" : String(raw.battery.brand ?? "").trim(),
          year: String(raw.battery.year ?? "").trim(),
          ampHours: String(raw.battery.ampHours ?? "").trim(),
          packVoltage: String(raw.battery.packVoltage ?? "").trim(),
          warrantyLength: String(raw.battery.warrantyLength ?? "").trim(),
        }
      : null,
    engine: engineMake ? { make: engineMake } : null,

    images,
    location: store?.slug ?? "",
    city: store?.city ?? "",
    state: store?.state ?? "",
    stateCode: store?.stateCode ?? "",
    storeName: store?.name ?? "",
    search: "",
  };
}

type NormalizedCart = ReturnType<typeof normalizeCart>;

/**
 * Assign the stable SEO slug for every cart:
 *   {make}-{model}-{color}-{city}-{state}, duplicates get -01, -02.
 *
 * Carts are sorted by id first so slug assignment is deterministic across runs:
 * the same cart keeps the same URL between refreshes, which is what stops the
 * sitemap churning and links rotting every six hours.
 */
function assignSlugs(carts: NormalizedCart[]): NormalizedCart[] {
  const counts = new Map<string, number>();
  for (const cart of [...carts].sort((a, b) => a.id.localeCompare(b.id))) {
    const parts = [cart.makeLabel, cart.modelLabel, cart.colorLabel, cart.city, cart.state]
      .map(toSlugPart)
      .filter(Boolean);
    const base = parts.length ? parts.join("-") : `cart-${cart.id}`;
    const seen = counts.get(base);
    if (seen === undefined) {
      counts.set(base, 0);
      cart.slug = base;
    } else {
      const next = seen + 1;
      counts.set(base, next);
      cart.slug = `${base}-${String(next).padStart(2, "0")}`;
    }
  }
  return carts;
}

/** The lowercased haystack the free-text search runs against. */
function buildSearchIndex(cart: NormalizedCart): string {
  return [
    cart.title, cart.makeLabel, cart.modelLabel, cart.colorLabel, cart.year,
    cart.condition, cart.fuel, cart.passengersLabel, cart.drivetrain,
    cart.battery, cart.tire, cart.city, cart.state, cart.stateCode,
    ...cart.features.map((feature) => FEATURE_LABELS[feature] ?? feature),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/* --------------------------------------------------------------- facets --- */

interface Facet { key: string; label: string; count: number; makeKey?: string }

/** Derive the facet lists the inventory UI and the brand pages are built from. */
function buildFacets(carts: NormalizedCart[]) {
  const bump = (map: Map<string, Facet>, key: string, label: string, extra: Partial<Facet> = {}) => {
    if (!key) return;
    const entry = map.get(key) ?? { key, label: label || key, count: 0, ...extra };
    entry.count += 1;
    map.set(key, entry);
  };

  const makes = new Map<string, Facet>();
  const models = new Map<string, Facet>();
  const colors = new Map<string, Facet>();
  const colorsExact = new Map<string, Facet>();
  const passengers = new Map<string, Facet>();
  const drivetrains = new Map<string, Facet>();
  const batteries = new Map<string, Facet>();
  const tires = new Map<string, Facet>();
  const conditions = new Map<string, Facet>();
  const fuels = new Map<string, Facet>();
  const features = new Map<string, Facet>();
  const locationCounts = new Map<string, Facet>();

  const titleCase = (value: string) =>
    value.replace(/-/g, " ").replace(/\b[a-z]/g, (character) => character.toUpperCase());

  for (const cart of carts) {
    bump(makes, cart.make, cart.makeLabel);
    if (cart.model) bump(models, `${cart.make}:${cart.model}`, cart.modelLabel, { makeKey: cart.make });
    bump(colors, cart.color, titleCase(cart.color));
    bump(colorsExact, cart.colorExact, cart.colorLabel);
    bump(passengers, cart.passengers, cart.passengersLabel);
    bump(drivetrains, cart.drivetrain, cart.drivetrain.toUpperCase());
    bump(batteries, cart.battery, cart.battery === "agm" ? "AGM" : titleCase(cart.battery));
    bump(tires, cart.tire, titleCase(cart.tire));
    bump(conditions, cart.condition, titleCase(cart.condition));
    bump(fuels, cart.fuel, titleCase(cart.fuel));
    bump(locationCounts, cart.location, `${cart.city}, ${cart.stateCode}`);
    for (const feature of cart.features) bump(features, feature, FEATURE_LABELS[feature] ?? titleCase(feature));
  }

  const sorted = (map: Map<string, Facet>) => [...map.values()].sort((a, b) => a.label.localeCompare(b.label));

  return {
    conditions: sorted(conditions),
    fuels: sorted(fuels),
    makes: sorted(makes),
    models: [...models.values()]
      .map((entry) => ({ ...entry, key: entry.key.split(":")[1] }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    colors: sorted(colors),
    colorsExact: sorted(colorsExact),
    passengers: sorted(passengers),
    drivetrains: sorted(drivetrains),
    batteries: sorted(batteries),
    tires: sorted(tires),
    features: FEATURE_KEYS.map((key) => features.get(key)).filter(Boolean) as Facet[],
    locations: sorted(locationCounts),
  };
}

function summarize(carts: NormalizedCart[]) {
  const prices = carts.map((cart) => cart.price).filter((price): price is number => typeof price === "number");
  const has = (feature: string) => carts.filter((cart) => cart.features.includes(feature)).length;
  return {
    total: carts.length,
    new: carts.filter((cart) => cart.condition === "new").length,
    used: carts.filter((cart) => cart.condition === "used").length,
    electric: carts.filter((cart) => cart.fuel === "electric").length,
    gas: carts.filter((cart) => cart.fuel === "gas").length,
    streetLegal: has("street-legal"),
    lifted: has("lifted"),
    fourByFour: carts.filter((cart) => cart.drivetrain === "4x4").length,
    allTerrain: carts.filter((cart) => cart.tire === "all-terrain").length,
    utility: carts.filter((cart) => cart.passengers === "utility").length,
    lithium: carts.filter((cart) => cart.battery === "lithium").length,
    lead: carts.filter((cart) => cart.battery === "lead").length,
    photoCount: carts.reduce((total, cart) => total + cart.images.length, 0),
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    priceCount: prices.length,
  };
}

/* ------------------------------------------------------------------ run --- */

/** The slim per-cart record the browser fetches for client-side filtering. */
function toClientRecord(cart: NormalizedCart) {
  return {
    id: cart.id,
    slug: cart.slug,
    title: cart.title,
    year: cart.year,
    price: cart.price,
    condition: cart.condition,
    fuel: cart.fuel,
    make: cart.make,
    makeLabel: cart.makeLabel,
    model: cart.model,
    modelLabel: cart.modelLabel,
    color: cart.color,
    colorExact: cart.colorExact,
    colorLabel: cart.colorLabel,
    passengers: cart.passengers,
    passengersLabel: cart.passengersLabel,
    drivetrain: cart.drivetrain,
    battery: cart.battery,
    tire: cart.tire,
    features: cart.features,
    location: cart.location,
    city: cart.city,
    state: cart.state,
    stateCode: cart.stateCode,
    // The derivative stem, not the DMS filename: the browser rebuilds the
    // srcset from this and the shared width ladder.
    imageStem: cart.images.length ? photoStem(cart.slug, 0) : "",
    imageCount: cart.images.length,
    search: cart.search,
  };
}

function writeJson(path: string, value: unknown): number {
  mkdirSync(dirname(path), { recursive: true });
  // Minified: no pretty-print. The snapshot is machine input, not a document.
  const body = JSON.stringify(value);
  writeFileSync(path, body, "utf8");
  return Buffer.byteLength(body);
}

async function loadLive() {
  process.stderr.write(`Fetching stores from the DMS (${DMS_BASE_URL})...\n`);
  const dmsStores = await getStores();
  process.stderr.write(`  ${Array.isArray(dmsStores) ? dmsStores.length : 0} stores\n`);
  process.stderr.write("Fetching inventory from the DMS...\n");
  const { carts, reportedTotal } = await getAllCarts({ pageSize: 100 });
  if (!carts.length) {
    throw new Error("DMS returned zero inventory records — refusing to treat that as a valid catalogue");
  }
  return { rawCarts: carts, dmsStores, reportedTotal };
}

async function main() {
  let source: { rawCarts: any[]; dmsStores: DmsStore[]; reportedTotal: number | null } | null = null;
  let usedFallback = false;
  let fetchError: Error | null = null;

  if (useFixture) {
    if (requireLive) {
      process.stderr.write("FATAL: --fixture and --require-live are contradictory.\n");
      process.exit(1);
    }
    if (!existsSync(FIXTURE)) {
      process.stderr.write(`FATAL: no fixture at ${FIXTURE}\n`);
      process.exit(1);
    }
    process.stderr.write(`Normalizing the offline fixture at assets-raw/dms-fixture.json (no network).\n`);
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
    source = { rawCarts: fixture.carts, dmsStores: fixture.stores, reportedTotal: fixture.carts.length };
  } else if (!offline) {
    try {
      source = await loadLive();
    } catch (error) {
      fetchError = error as Error;
    }
  }

  if (!source) {
    const why = offline ? "--offline was requested" : `the DMS could not be reached: ${fetchError?.message}`;

    if (requireLive) {
      process.stderr.write(
        `\n${"=".repeat(72)}\n` +
          `FATAL: live DMS data was required and ${why}\n` +
          `${"=".repeat(72)}\n` +
          "Refusing to build from a stale snapshot because --require-live was passed.\n" +
          "Re-run without --require-live to publish the last good snapshot instead.\n",
      );
      process.exit(1);
    }

    if (!existsSync(SNAPSHOT)) {
      process.stderr.write(
        `\n${"=".repeat(72)}\n` +
          `FATAL: ${why}\n` +
          `and there is no committed fallback snapshot at src/data/snapshot.json.\n` +
          `${"=".repeat(72)}\n` +
          "Nothing was written. The build cannot proceed without inventory data.\n",
      );
      process.exit(1);
    }

    // Loudly log the fallback and leave every file exactly as committed. An
    // empty or partial snapshot must never overwrite a good one.
    const previous = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
    process.stderr.write(
      `\n${"!".repeat(72)}\n` +
        `FALLBACK IN USE — ${why}\n` +
        `Keeping the committed snapshot from ${previous.updatedAt} ` +
        `(${previous.summary?.total ?? "?"} carts). Nothing was overwritten.\n` +
        `Inventory shown on the site may be stale. Re-run the refresh workflow once the DMS is reachable.\n` +
        `${"!".repeat(72)}\n`,
    );
    process.exit(0);
  }

  /* --- normalize ------------------------------------------------------- */

  const stores = mergeStores(source.dmsStores);
  const storeById = new Map(stores.filter((store) => store.storeId).map((store) => [store.storeId as string, store]));

  reportFunnel(source.rawCarts);

  const sellable = source.rawCarts.filter(isSellable);
  const exclusionReasons: Record<string, number> = {};
  for (const raw of source.rawCarts) {
    if (isSellable(raw)) continue;
    const key = exclusionReason(raw);
    exclusionReasons[key] = (exclusionReasons[key] ?? 0) + 1;
  }
  if (Object.keys(exclusionReasons).length) {
    process.stderr.write(
      `\nHeld back ${source.rawCarts.length - sellable.length} non-retail records: ` +
        Object.entries(exclusionReasons).map(([key, count]) => `${key}=${count}`).join(", ") +
        "\n",
    );
  }

  const carts = assignSlugs(sellable.map((raw) => normalizeCart(raw, storeById)));
  for (const cart of carts) cart.search = buildSearchIndex(cart);

  // Featured order: photographed first, then most expensive. Stable tiebreak on
  // id so "featured" is the same list on every build.
  carts.sort((a, b) => {
    if (a.images.length !== b.images.length && (a.images.length === 0 || b.images.length === 0)) {
      return b.images.length - a.images.length;
    }
    return (b.price ?? 0) - (a.price ?? 0) || a.id.localeCompare(b.id);
  });

  for (const store of stores) {
    store.cartCount = carts.filter((cart) => cart.location === store.slug).length;
  }

  const facets = buildFacets(carts);
  const summary = summarize(carts);
  const updatedAt = isoStamp();

  /* --- write ----------------------------------------------------------- */

  const snapshot = {
    updatedAt,
    source: useFixture ? "dms-fixture" : "dms-live",
    dms: { baseUrl: DMS_BASE_URL },
    rules: { requireRfs: REQUIRE_RFS, requirePhotos: REQUIRE_PHOTOS, requirePrice: REQUIRE_PRICE },
    fetch: {
      rawRecordsFetched: source.rawCarts.length,
      reportedTotal: source.reportedTotal,
      published: carts.length,
      excluded: source.rawCarts.length - sellable.length,
      exclusionReasons,
    },
    summary,
    facets,
    stores,
    carts,
  };

  const written: Array<[string, number]> = [];
  written.push(["src/data/snapshot.json", writeJson(SNAPSHOT, snapshot)]);
  written.push(["src/data/stores.json", writeJson(resolve(SRC_DATA, "stores.json"), { updatedAt, stores })]);
  written.push(["src/data/facets.json", writeJson(resolve(SRC_DATA, "facets.json"), { updatedAt, facets })]);
  written.push([
    "src/data/models.json",
    writeJson(resolve(SRC_DATA, "models.json"), {
      updatedAt,
      makes: facets.makes,
      models: facets.models,
    }),
  ]);
  written.push([
    "src/data/categories.json",
    writeJson(resolve(SRC_DATA, "categories.json"), {
      updatedAt,
      conditions: facets.conditions,
      fuels: facets.fuels,
      features: facets.features,
      passengers: facets.passengers,
      drivetrains: facets.drivetrains,
      batteries: facets.batteries,
      tires: facets.tires,
    }),
  ]);
  // Guides (the site's blog) and testimonials are authored locally: the DMS has
  // no endpoint for either. They are snapshotted alongside the inventory so
  // every dataset the frontend reads has one shape and one updatedAt.
  written.push([
    "src/data/blog.json",
    writeJson(resolve(SRC_DATA, "blog.json"), { updatedAt, source: "local", posts: guides }),
  ]);
  written.push([
    "src/data/testimonials.json",
    writeJson(resolve(SRC_DATA, "testimonials.json"), { updatedAt, source: "local", testimonials }),
  ]);

  // Runtime files: static JSON served from public/, fetched by the inventory
  // browser. These are files on a CDN, not an API.
  written.push([
    "public/data/inventory-index.json",
    writeJson(resolve(PUBLIC_DATA, "inventory-index.json"), {
      updatedAt,
      total: carts.length,
      carts: carts.map(toClientRecord),
    }),
  ]);
  written.push(["public/data/facets.json", writeJson(resolve(PUBLIC_DATA, "facets.json"), { updatedAt, facets })]);
  written.push([
    "public/data/meta.json",
    writeJson(resolve(PUBLIC_DATA, "meta.json"), { updatedAt, source: "dms-live", summary }),
  ]);

  /* --- report ---------------------------------------------------------- */

  const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
  process.stderr.write(`\n${"-".repeat(72)}\nSnapshot written at ${updatedAt}\n${"-".repeat(72)}\n`);
  for (const [name, bytes] of written) {
    process.stderr.write(`  ${name.padEnd(36)} ${kb(bytes).padStart(10)}\n`);
  }
  process.stderr.write(
    `\n  ${summary.total} carts published (${summary.new} new, ${summary.used} used), ` +
      `${summary.photoCount} photos\n` +
      `  ${facets.makes.length} makes, ${facets.models.length} models, ` +
      `${facets.colors.length} colour families, ${stores.length} locations\n` +
      `  price range $${summary.priceMin?.toLocaleString("en-US")} – $${summary.priceMax?.toLocaleString("en-US")}\n`,
  );
  process.stderr.write(`\nFields dropped from the snapshot (never read by the frontend):\n`);
  for (const field of DROPPED_FIELDS) process.stderr.write(`  - ${field}\n`);
  if (usedFallback) process.stderr.write("\nNOTE: built from the committed fallback snapshot.\n");
}

/**
 * Only run when executed directly. Importing this module (from a test, or
 * another script that wants one of its helpers) must not fire a network fetch.
 */
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`\nFATAL: ${error.stack ?? error}\n`);
    process.exit(1);
  });
}
