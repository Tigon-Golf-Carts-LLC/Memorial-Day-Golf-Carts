/**
 * The route table: every URL the site publishes, in one place.
 *
 * Both script/prerender.ts and script/generate-seo.ts build from this, which is
 * what guarantees the Phase 11 invariants hold by construction rather than by
 * inspection: every sitemap URL resolves to a file that was written, and no
 * noindex or canonicalized page appears in the sitemap.
 */

import { LISTING_ROUTES, LISTING_ALIASES, type ListingRoute } from "./routes.ts";
import { PAGE_SIZE } from "../pages/inventory.ts";
import { brandSlug } from "../pages/brands.ts";
import { guides } from "../../src/config/guides.ts";
import {
  parseQuery, filterCarts, buildVocabulary, MULTI_FIELDS,
  type FilterState, type MultiField, type FilterableCart,
} from "../../src/lib/filters.ts";

export type RouteKind =
  | "home" | "pillar" | "event" | "listing" | "listing-page" | "listing-alias"
  | "vehicle" | "brands" | "brand" | "model" | "locations" | "location"
  | "location-inventory" | "guides" | "guide" | "content" | "legal" | "sitemap" | "404";

export interface RouteEntry {
  path: string;
  kind: RouteKind;
  /** Sitemap hints. */
  priority?: number;
  changefreq?: string;
  lastmod?: string;
  /** Excluded from the sitemap: aliases, paginated pages. */
  excludeFromSitemap?: boolean;
  /** noindex,follow on the page itself. */
  noindex?: boolean;
  /** Canonical target when this route folds into another. */
  canonicalTo?: string;
  /** Payload the prerenderer needs, by kind. */
  route?: ListingRoute;
  cart?: any;
  make?: any;
  model?: any;
  store?: any;
  guide?: any;
  page?: number;
  legalKind?: string;
}

/** Apply a listing route's locked filters, exactly as the renderer does. */
function lockedState(locked: Partial<Record<MultiField, string[]>>, vocab: ReturnType<typeof buildVocabulary>): FilterState {
  const { state } = parseQuery("", vocab);
  const next: FilterState = { ...state };
  for (const field of MULTI_FIELDS) {
    const values = locked[field];
    if (values?.length) next[field] = values;
  }
  return next;
}

export function buildRouteTable(snapshot: {
  updatedAt: string;
  summary: Record<string, number | null>;
  facets: Record<string, any[]>;
  stores: any[];
  carts: FilterableCart[];
}): RouteEntry[] {
  const routes: RouteEntry[] = [];
  const vocab = buildVocabulary(snapshot.carts);
  const lastmod = snapshot.updatedAt;

  /* --- top level ------------------------------------------------------- */

  routes.push({ path: "/", kind: "home", priority: 1.0, changefreq: "daily", lastmod });
  routes.push({ path: "/golf-carts-for-sale/", kind: "pillar", priority: 0.9, changefreq: "daily", lastmod });
  routes.push({
    path: "/memorial-day-golf-cart-sales-event/",
    kind: "event",
    priority: 0.9,
    changefreq: "daily",
    lastmod,
  });

  /* --- listing routes and their pagination ----------------------------- */

  for (const route of LISTING_ROUTES) {
    const count = filterCarts(snapshot.carts, lockedState(route.locked, vocab)).length;
    routes.push({
      path: route.path,
      kind: "listing",
      route,
      priority: route.priority ?? 0.7,
      changefreq: "daily",
      lastmod,
    });

    // Page 2..n as real URLs so pagination is crawlable and JS-free usable.
    // They are self-canonical with rel prev/next but stay out of the sitemap:
    // every cart already has its own indexable page.
    const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
    for (let page = 2; page <= pageCount; page += 1) {
      routes.push({
        path: `${route.path}page/${page}/`,
        kind: "listing-page",
        route,
        page,
        excludeFromSitemap: true,
        noindex: true,
        lastmod,
      });
    }
  }

  // Canonicalized aliases: real files, crawlable, folded into a parent.
  for (const alias of LISTING_ALIASES) {
    routes.push({
      path: alias.path,
      kind: "listing-alias",
      route: alias,
      canonicalTo: alias.canonicalTo,
      excludeFromSitemap: true,
      lastmod,
    });
  }

  /* --- vehicles -------------------------------------------------------- */

  for (const cart of snapshot.carts) {
    routes.push({
      path: `/golfcart/${cart.slug}/`,
      kind: "vehicle",
      cart,
      priority: 0.8,
      changefreq: "daily",
      lastmod,
    });
  }

  /* --- brands and models ----------------------------------------------- */

  routes.push({ path: "/brands/", kind: "brands", priority: 0.7, changefreq: "weekly", lastmod });
  for (const make of snapshot.facets.makes) {
    routes.push({
      path: `/brands/${brandSlug(make.key)}/`,
      kind: "brand",
      make,
      priority: 0.7,
      changefreq: "daily",
      lastmod,
    });
    for (const model of snapshot.facets.models.filter((entry) => entry.makeKey === make.key)) {
      routes.push({
        path: `/brands/${brandSlug(make.key)}/${model.key}/`,
        kind: "model",
        make,
        model,
        priority: 0.6,
        changefreq: "daily",
        lastmod,
      });
    }
  }

  /* --- locations ------------------------------------------------------- */

  routes.push({ path: "/locations/", kind: "locations", priority: 0.8, changefreq: "weekly", lastmod });
  for (const store of snapshot.stores) {
    routes.push({
      path: `/locations/${store.slug}/`,
      kind: "location",
      store,
      priority: 0.7,
      changefreq: "weekly",
      lastmod,
    });
    if (store.cartCount > 0) {
      const path = `/locations/${store.slug}/inventory/`;
      routes.push({
        path,
        kind: "location-inventory",
        store,
        priority: 0.6,
        changefreq: "daily",
        lastmod,
      });
      // Same treatment as the category listings: page 2+ is a real, crawlable
      // file so the pager works with JavaScript off, but it is noindex and out
      // of the sitemap because every cart on it is indexed on its own page.
      const pageCount = Math.max(1, Math.ceil(store.cartCount / PAGE_SIZE));
      for (let page = 2; page <= pageCount; page += 1) {
        routes.push({
          path: `${path}page/${page}/`,
          kind: "location-inventory",
          store,
          page,
          excludeFromSitemap: true,
          noindex: true,
          lastmod,
        });
      }
    }
  }

  /* --- guides ---------------------------------------------------------- */

  routes.push({ path: "/guides/", kind: "guides", priority: 0.7, changefreq: "weekly", lastmod });
  for (const guide of guides) {
    routes.push({
      path: `/guides/${guide.slug}/`,
      kind: "guide",
      guide,
      priority: 0.7,
      changefreq: "monthly",
      lastmod: `${guide.updated}T09:00:00+00:00`,
    });
  }

  /* --- content and legal ----------------------------------------------- */

  const content: Array<[string, number]> = [
    ["/financing/", 0.8],
    ["/trade-in/", 0.7],
    ["/delivery/", 0.7],
    ["/service/", 0.7],
    ["/about/", 0.6],
    ["/contact/", 0.8],
    ["/faq/", 0.7],
  ];
  for (const [path, priority] of content) {
    routes.push({ path, kind: "content", priority, changefreq: "monthly", lastmod });
  }

  routes.push({ path: "/sitemap/", kind: "sitemap", priority: 0.3, changefreq: "weekly", lastmod });
  for (const legalKind of ["privacy", "terms", "accessibility"]) {
    routes.push({
      path: `/${legalKind}/`,
      kind: "legal",
      legalKind,
      priority: 0.2,
      changefreq: "yearly",
      lastmod,
    });
  }

  // The 404 body. Written as a file, never indexed, never in the sitemap.
  routes.push({ path: "/404.html", kind: "404", noindex: true, excludeFromSitemap: true });

  return routes;
}
