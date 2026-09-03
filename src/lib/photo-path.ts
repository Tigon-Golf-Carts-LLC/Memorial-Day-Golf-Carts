/**
 * The cart-photo filename convention, in one place.
 *
 * Three things need to agree on where a cart photo's derivatives live:
 * script/optimize-assets.ts writes them, script/fetch-data.ts records the stem
 * in the client index, and src/client/inventory.ts rebuilds the srcset in the
 * browser. They import this so the convention cannot drift.
 *
 * The cart's snapshot slug is the base because it is unique per cart — make,
 * model, colour and city are not: 374 of 969 photos collided when the stem was
 * derived from those labels, and one cart's photographs overwrote another's.
 */

import { slugKey } from "./normalize.ts";

/** "denago-nomad-xl-white-hatfield-pennsylvania-01" + photo index -> stem. */
export function photoStem(slug: string, index: number): string {
  const base = slugKey(slug);
  return `${base || "golf-cart"}-${index + 1}`;
}

/** Widths generated for a cart's primary photo (cards, hero, OG card). */
export const PRIMARY_WIDTHS = [400, 800, 1200] as const;
/** Widths generated for the remaining gallery photos. */
export const GALLERY_WIDTHS = [400, 800] as const;
/** Cart photography is cropped to a 4:3 landscape box. */
export const CART_ASPECT = 3 / 4;
