/**
 * Enum normalization — the single place raw DMS display strings become stable,
 * lowercase, machine-comparable values.
 *
 * Phase 3 depends on this module. The "New shows used carts" class of bug comes
 * from comparing a URL value (`new`) against a raw display string (`"New"`, or
 * worse `"Pre-Owned"`). Normalizing once at snapshot time means the filter only
 * ever compares `"new" === "new"`, and a `new` query can never match a used
 * cart because no used cart carries the value `new` on any field.
 *
 * Every map here is applied by script/fetch-data.ts when the snapshot is
 * written, and by the URL parser when a query string is read, so both sides of
 * every comparison have been through the same function.
 */

/** Lowercase, hyphen-separated, URL-safe key. Shared by every normalizer below. */
export function slugKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ------------------------------------------------------------- condition --- */

export type Condition = "new" | "used";

/**
 * Condition synonyms. Everything a dealer might type for a used cart collapses
 * to `used`; anything else recognisably new collapses to `new`.
 */
const CONDITION_SYNONYMS: Record<string, Condition> = {
  new: "new",
  "brand-new": "new",
  "brand-new-in-crate": "new",
  unused: "new",
  used: "used",
  "pre-owned": "used",
  preowned: "used",
  "pre-own": "used",
  "certified-pre-owned": "used",
  cpo: "used",
  "second-hand": "used",
  secondhand: "used",
  "previously-owned": "used",
  reconditioned: "used",
  refurbished: "used",
  "trade-in": "used",
};

/** Normalize any condition string to `new` or `used`; unknown input yields null. */
export function normalizeCondition(value: unknown): Condition | null {
  const key = slugKey(value);
  if (!key) return null;
  return CONDITION_SYNONYMS[key] ?? null;
}

/* ------------------------------------------------------------------ fuel --- */

export type Fuel = "electric" | "gas";

const FUEL_SYNONYMS: Record<string, Fuel> = {
  electric: "electric",
  ev: "electric",
  battery: "electric",
  "battery-electric": "electric",
  bev: "electric",
  gas: "gas",
  gasoline: "gas",
  petrol: "gas",
  efi: "gas",
  "gas-powered": "gas",
  combustion: "gas",
};

export function normalizeFuel(value: unknown): Fuel | null {
  const key = slugKey(value);
  if (!key) return null;
  return FUEL_SYNONYMS[key] ?? null;
}

/* ----------------------------------------------------------------- color --- */

/**
 * Colour families.
 *
 * The DMS carries 23 distinct colour strings, several of which are the same
 * colour to a shopper ("Matte Black", "Metallic Black") and one of which is a
 * plain typo ("Champane"). Filter options are offered as families, so choosing
 * "Black" returns matte and metallic black too; the exact colour is kept
 * separately for display and for schema.org `color`.
 */
const COLOR_FAMILIES: Record<string, string[]> = {
  black: ["black", "matte-black", "metallic-black"],
  white: ["white", "matte-white", "glacier"],
  gray: ["gray", "grey", "silver", "gunmetal", "charcoal", "bluestone"],
  blue: ["blue", "light-blue", "gulf-blue", "navy", "indigo", "royal-blue"],
  aqua: ["aqua", "teal", "turquoise", "seafoam"],
  green: ["green", "verdant", "lime", "olive", "forest-green"],
  red: ["red", "scarlet", "lava", "burgundy", "maroon", "crimson"],
  beige: ["beige", "champagne", "champane", "tan", "sand", "cream", "ivory"],
  orange: ["orange", "copper", "bronze"],
  yellow: ["yellow", "gold"],
  purple: ["purple", "violet", "plum"],
  pink: ["pink", "magenta"],
  brown: ["brown", "chocolate", "espresso"],
  patriotic: ["american", "americana", "stars-and-stripes", "flag"],
};

/** Exact colour keys that are really a typo for another key. */
const COLOR_TYPOS: Record<string, string> = {
  champane: "champagne",
  grey: "gray",
};

const COLOR_TO_FAMILY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [family, members] of Object.entries(COLOR_FAMILIES)) {
    for (const member of members) map[member] = family;
  }
  return map;
})();

/** The exact colour key, with known DMS typos corrected. */
export function normalizeColorExact(value: unknown): string {
  const key = slugKey(value);
  return COLOR_TYPOS[key] ?? key;
}

/** The colour family a colour belongs to, or the exact key when it is unfamiliar. */
export function normalizeColorFamily(value: unknown): string {
  const exact = normalizeColorExact(value);
  if (!exact) return "";
  return COLOR_TO_FAMILY[exact] ?? exact;
}

/** Every family key, for building filter UI in a stable order. */
export const COLOR_FAMILY_KEYS = Object.keys(COLOR_FAMILIES);

/* ------------------------------------------------------------------ make --- */

/**
 * Make key in the DMS filter format: lowercase, non-alphanumerics to
 * underscores ("Club Car" -> "club_car", "Swift EV" -> "swift_ev").
 */
export function normalizeMake(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Model key: hyphenated slug, scoped to a make by the caller. */
export function normalizeModel(value: unknown): string {
  return slugKey(value);
}

/* ------------------------------------------------------------ passengers --- */

/**
 * Passenger key. The DMS uses display strings ("4 Passenger", "Utility"); a
 * bare number is also accepted so `?passengers=4` works from a hand-typed URL.
 */
export function normalizePassengers(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return `${raw}-passenger`;
  const match = raw.match(/(\d+)\s*(?:passenger|pass|seat)/);
  if (match) return `${match[1]}-passenger`;
  if (/utility|cargo|work|haul/.test(raw)) return "utility";
  return slugKey(raw);
}

/** Display label for a passenger key. */
export function passengerLabel(key: string): string {
  if (key === "utility") return "Utility";
  const match = /^(\d+)-passenger$/.exec(key);
  return match ? `${match[1]} Passenger` : key.replace(/-/g, " ");
}

/* ------------------------------------------------------------ drivetrain --- */

/** Drivetrain key, lowercased so "4X4" and "4x4" are the same value. */
export function normalizeDriveTrain(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return "";
  if (/^4x4$|^awd$|^4wd$|4-?wheel-?drive/.test(raw)) return "4x4";
  if (/^2x4$|^2wd$|^rwd$|^fwd$/.test(raw)) return "2x4";
  return slugKey(raw);
}

/* --------------------------------------------------------------- battery --- */

export function normalizeBatteryType(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (/lithium|lifepo|li-?ion/.test(raw)) return "lithium";
  if (/\bagm\b/.test(raw)) return "agm";
  if (/lead|flooded|wet[- ]?cell|acid/.test(raw)) return "lead";
  return slugKey(raw);
}

/* ------------------------------------------------------------------ tire --- */

export function normalizeTireType(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (/all[- ]?terrain|off[- ]?road|knobby|mud/.test(raw)) return "all-terrain";
  if (/street|turf|highway|road/.test(raw)) return "street";
  return slugKey(raw);
}

/* ----------------------------------------------------------------- misc --- */

/** A year as a number, or null when the DMS left it blank. */
export function normalizeYear(value: unknown): number | null {
  const year = parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(year) || year < 1950 || year > 2100) return null;
  return year;
}

/** A price as a positive number, or null. Accepts "$12,995" style strings. */
export function normalizePrice(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value.replace(/[^0-9.]/g, "")) : Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number;
}
