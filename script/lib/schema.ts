/**
 * JSON-LD graph builders (Phase 7).
 *
 * Rules this module enforces so the markup never over-claims:
 *   - Nothing is emitted for content that is not on the page. Callers pass the
 *     entities the page actually renders; there is no "always include FAQ".
 *   - `itemCondition` is derived from the same normalized `condition` field the
 *     filters use, so a page badged "Used" cannot ship NewCondition schema.
 *   - The telephone is `site.phoneE164` everywhere, matching the visible text
 *     and the tel: href byte for byte (Phase 8 entity consistency).
 */

import { site, salesEvent } from "../../src/config/site.ts";
import { absoluteUrl } from "./util.ts";

export interface Store {
  slug: string;
  city: string;
  state: string;
  stateCode: string;
  lat: number | null;
  lng: number | null;
  address1: string;
  address2?: string;
  postalCode: string;
  name: string;
  cartCount: number;
  serviceArea?: string[];
}

/** Opening hours in schema.org form. Sunday is absent, which means closed. */
function openingHours() {
  return site.hours.map((block) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: block.days.map((day) => `https://schema.org/${day}`),
    opens: block.opens,
    closes: block.closes,
  }));
}

/**
 * The site-wide AutoDealer node. Referenced by @id from every other node.
 *
 * `address` and `geo` come from the primary dealership — the first entry in the
 * location seed, which is the group's head office. Google's AutoDealer and
 * LocalBusiness types both require a postal address, and a dealer group with
 * none is treated as an incomplete entity. Individual lots carry their own
 * LocalBusiness node with their own address; this is the one for the business
 * as a whole.
 */
export function organizationNode(stores: Store[] = []) {
  const head = stores[0];
  return {
    "@type": ["AutoDealer", "Organization"],
    "@id": `${absoluteUrl("/")}#organization`,
    name: site.name,
    legalName: site.legalName,
    url: absoluteUrl("/"),
    logo: {
      "@type": "ImageObject",
      "@id": `${absoluteUrl("/")}#logo`,
      url: absoluteUrl("images/logo.png"),
      contentUrl: absoluteUrl("images/logo.png"),
      width: 512,
      height: 512,
      caption: site.name,
    },
    image: absoluteUrl("images/og-image.png"),
    description: site.description,
    telephone: site.phoneE164,
    email: site.email,
    priceRange: site.priceRange,
    currenciesAccepted: site.currency,
    paymentAccepted: "Cash, Check, Credit Card, Financing",
    foundingDate: site.founded,
    ...(head
      ? {
          address: {
            "@type": "PostalAddress",
            ...(head.address1 ? { streetAddress: [head.address1, head.address2].filter(Boolean).join(", ") } : {}),
            addressLocality: head.city,
            addressRegion: head.stateCode,
            ...(head.postalCode ? { postalCode: head.postalCode } : {}),
            addressCountry: site.country,
          },
        }
      : {}),
    ...(head && head.lat !== null && head.lng !== null
      ? { geo: { "@type": "GeoCoordinates", latitude: head.lat, longitude: head.lng } }
      : {}),
    areaServed: stores.length
      ? [...new Set(stores.map((store) => store.state))].map((state) => ({
          "@type": "State",
          name: state,
        }))
      : { "@type": "Country", name: "United States" },
    openingHoursSpecification: openingHours(),
    sameAs: [...site.social],
    ...(stores.length
      ? {
          location: stores.map((store) => ({ "@id": `${absoluteUrl(`/locations/${store.slug}/`)}#dealer` })),
        }
      : {}),
  };
}

/** One dealership location as a LocalBusiness/AutoDealer with geo. */
export function dealerNode(store: Store) {
  const url = absoluteUrl(`/locations/${store.slug}/`);
  return {
    "@type": ["AutoDealer", "LocalBusiness"],
    "@id": `${url}#dealer`,
    name: store.name,
    url,
    parentOrganization: { "@id": `${absoluteUrl("/")}#organization` },
    telephone: site.phoneE164,
    email: site.email,
    priceRange: site.priceRange,
    image: absoluteUrl("images/og-image.png"),
    address: {
      "@type": "PostalAddress",
      ...(store.address1 ? { streetAddress: [store.address1, store.address2].filter(Boolean).join(", ") } : {}),
      addressLocality: store.city,
      addressRegion: store.stateCode,
      ...(store.postalCode ? { postalCode: store.postalCode } : {}),
      addressCountry: site.country,
    },
    ...(store.lat !== null && store.lng !== null
      ? { geo: { "@type": "GeoCoordinates", latitude: store.lat, longitude: store.lng } }
      : {}),
    ...(store.serviceArea?.length
      ? { areaServed: store.serviceArea.map((area) => ({ "@type": "Place", name: area })) }
      : {}),
    openingHoursSpecification: openingHours(),
  };
}

/** The WebSite node, with the on-site search action. */
export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": `${absoluteUrl("/")}#website`,
    url: absoluteUrl("/"),
    name: site.name,
    description: site.shortDescription,
    inLanguage: site.language,
    publisher: { "@id": `${absoluteUrl("/")}#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl("/inventory/")}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** The WebPage node for one route. `dateModified` carries the freshness signal. */
export function webPageNode(options: {
  path: string;
  title: string;
  description: string;
  modifiedAt: string;
  publishedAt?: string;
  image?: string;
  breadcrumbId?: string;
}) {
  const url = absoluteUrl(options.path);
  return {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: options.title,
    description: options.description,
    inLanguage: site.language,
    isPartOf: { "@id": `${absoluteUrl("/")}#website` },
    about: { "@id": `${absoluteUrl("/")}#organization` },
    ...(options.image ? { primaryImageOfPage: { "@type": "ImageObject", url: absoluteUrl(options.image) } } : {}),
    ...(options.publishedAt ? { datePublished: options.publishedAt } : {}),
    dateModified: options.modifiedAt,
    ...(options.breadcrumbId ? { breadcrumb: { "@id": options.breadcrumbId } } : {}),
  };
}

export interface Crumb {
  href: string;
  label: string;
}

/** BreadcrumbList for a page. Every page gets one (Phase 7). */
export function breadcrumbNode(path: string, crumbs: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(path)}#breadcrumb`,
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      item: absoluteUrl(crumb.href),
    })),
  };
}

/** FAQPage for a Q&A section that is actually rendered on the page. */
export function faqNode(path: string, entries: Array<{ q: string; a: string }>) {
  return {
    "@type": "FAQPage",
    "@id": `${absoluteUrl(path)}#faq`,
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.q,
      acceptedAnswer: { "@type": "Answer", text: entry.a },
    })),
  };
}

export interface VehicleCart {
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
  drivetrain: string;
  battery: string;
  vin?: string;
  odometer?: number | null;
  features: string[];
  city: string;
  stateCode: string;
  location: string;
  images: string[];
}

/**
 * A cart as a Vehicle + Product offer.
 *
 * `itemCondition` comes straight from the normalized `condition`, which is the
 * same value `?condition=` filters on — so the schema and the filter can never
 * disagree about whether a cart is new.
 */
export function vehicleNode(cart: VehicleCart, imageUrls: string[]) {
  const url = absoluteUrl(`/golfcart/${cart.slug}/`);
  const condition = cart.condition === "used" ? "UsedCondition" : "NewCondition";
  const configuration = [
    cart.features.includes("lifted") ? "Lifted" : "",
    cart.features.includes("street-legal") ? "Street Legal LSV" : "",
    cart.passengersLabel,
    cart.drivetrain ? cart.drivetrain.toUpperCase() : "",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    "@type": ["Vehicle", "Product"],
    "@id": `${url}#vehicle`,
    name: [cart.year, cart.title].filter(Boolean).join(" "),
    url,
    sku: cart.id,
    ...(cart.vin ? { vehicleIdentificationNumber: cart.vin } : {}),
    description:
      `${cart.condition === "used" ? "Used" : "New"} ${[cart.year, cart.makeLabel, cart.modelLabel].filter(Boolean).join(" ")} ` +
      `golf cart in ${cart.colorLabel || "stock"}, ${cart.fuel === "electric" ? "electric" : "gas"} powered` +
      `${cart.passengersLabel ? `, ${cart.passengersLabel.toLowerCase()}` : ""}, ` +
      `for sale at the ${salesEvent.name} in ${cart.city}, ${cart.stateCode}.`,
    image: imageUrls,
    brand: { "@type": "Brand", name: cart.makeLabel || site.name },
    ...(cart.modelLabel ? { model: cart.modelLabel } : {}),
    ...(cart.year ? { vehicleModelDate: String(cart.year), productionDate: String(cart.year) } : {}),
    ...(configuration ? { vehicleConfiguration: configuration } : {}),
    itemCondition: `https://schema.org/${condition}`,
    ...(cart.colorLabel ? { color: cart.colorLabel } : {}),
    ...(cart.fuel ? { fuelType: cart.fuel === "electric" ? "Electric" : "Gasoline" } : {}),
    ...(cart.battery === "lithium" ? { vehicleEngine: { "@type": "EngineSpecification", engineType: "Lithium-ion electric" } } : {}),
    ...(cart.drivetrain ? { driveWheelConfiguration: cart.drivetrain.toUpperCase() } : {}),
    ...(cart.passengersLabel
      ? { seatingCapacity: Number(cart.passengersLabel.replace(/\D/g, "")) || undefined }
      : {}),
    ...(cart.odometer
      ? { mileageFromOdometer: { "@type": "QuantitativeValue", value: cart.odometer, unitCode: "SMI" } }
      : {}),
    offers: {
      "@type": "Offer",
      "@id": `${url}#offer`,
      url,
      ...(cart.price ? { price: cart.price, priceCurrency: site.currency } : {}),
      availability: "https://schema.org/InStock",
      itemCondition: `https://schema.org/${condition}`,
      ...(cart.price ? {} : { description: "Call for price" }),
      seller: { "@id": `${absoluteUrl(`/locations/${cart.location}/`)}#dealer` },
      availableAtOrFrom: { "@id": `${absoluteUrl(`/locations/${cart.location}/`)}#dealer` },
    },
  };
}

/** ItemList + CollectionPage for a listing page. */
export function itemListNode(
  path: string,
  items: Array<{ slug: string; title: string; year: number | null }>,
  total: number,
) {
  return {
    "@type": "ItemList",
    "@id": `${absoluteUrl(path)}#itemlist`,
    numberOfItems: total,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(`/golfcart/${item.slug}/`),
      name: [item.year, item.title].filter(Boolean).join(" "),
    })),
  };
}

export function collectionPageNode(options: {
  path: string;
  title: string;
  description: string;
  modifiedAt: string;
  total: number;
}) {
  const url = absoluteUrl(options.path);
  return {
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    url,
    name: options.title,
    description: options.description,
    inLanguage: site.language,
    isPartOf: { "@id": `${absoluteUrl("/")}#website` },
    dateModified: options.modifiedAt,
    mainEntity: { "@id": `${url}#itemlist` },
  };
}

/** Article for a guide or blog post. */
export function articleNode(guide: {
  slug: string;
  title: string;
  description: string;
  date: string;
  updated: string;
  category: string;
  tags: string[];
  readingMinutes: number;
}) {
  const url = absoluteUrl(`/guides/${guide.slug}/`);
  return {
    "@type": ["Article", "BlogPosting"],
    "@id": `${url}#article`,
    headline: guide.title,
    description: guide.description,
    url,
    mainEntityOfPage: { "@id": `${url}#webpage` },
    datePublished: `${guide.date}T09:00:00+00:00`,
    dateModified: `${guide.updated}T09:00:00+00:00`,
    author: { "@id": `${absoluteUrl("/")}#organization` },
    publisher: { "@id": `${absoluteUrl("/")}#organization` },
    image: absoluteUrl("images/og-image.png"),
    articleSection: guide.category,
    keywords: guide.tags.join(", "),
    inLanguage: site.language,
    timeRequired: `PT${guide.readingMinutes}M`,
  };
}

/** The sales event itself, for the event pillar page. */
export function saleEventNode(year: number, total: number, priceMin: number | null, priceMax: number | null) {
  return {
    "@type": "SaleEvent",
    "@id": `${absoluteUrl("/memorial-day-golf-cart-sales-event/")}#event`,
    name: `${salesEvent.name} ${year}`,
    description: salesEvent.subhead,
    startDate: `${year}-${salesEvent.startMonthDay}`,
    endDate: `${year}-${salesEvent.endMonthDay}`,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: absoluteUrl("/memorial-day-golf-cart-sales-event/"),
    organizer: { "@id": `${absoluteUrl("/")}#organization` },
    location: { "@id": `${absoluteUrl("/")}#organization` },
    image: absoluteUrl("images/og-image.png"),
    ...(priceMin && priceMax
      ? {
          offers: {
            "@type": "AggregateOffer",
            offerCount: total,
            lowPrice: priceMin,
            highPrice: priceMax,
            priceCurrency: site.currency,
            availability: "https://schema.org/InStock",
            seller: { "@id": `${absoluteUrl("/")}#organization` },
          },
        }
      : {}),
  };
}

/** Wrap nodes into a single @graph document. */
export function graph(nodes: unknown[]) {
  return { "@context": "https://schema.org", "@graph": nodes.filter(Boolean) };
}
