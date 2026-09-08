/**
 * Brand and model pages.
 *
 *   /brands/                     index of every make in stock
 *   /brands/<make>/              one make, its models, its carts
 *   /brands/<make>/<model>/      one model
 *
 * Brand and model pages are named in the brief as part of the supporting
 * cluster. Each one is backed by real stock counts and price ranges from the
 * snapshot, which is what makes them worth citing rather than boilerplate.
 */

import { site, salesEvent } from "../../src/config/site.ts";
import { esc, withBase, formatPrice, clamp, titleize } from "../lib/util.ts";
import { renderPage } from "../lib/layout.ts";
import { cartCard, ctaBand, faqSection, answerBlock, statStrip, relatedLinks, comparisonTable } from "../lib/components.ts";
import { itemListNode, collectionPageNode, faqNode, type Crumb } from "../lib/schema.ts";
import { pickFaq, type Snapshot } from "./inventory.ts";
import type { FilterableCart } from "../../src/lib/filters.ts";

/** URL-safe brand slug. DMS make keys use underscores; URLs use hyphens. */
export function brandSlug(makeKey: string): string {
  return makeKey.replace(/_/g, "-");
}

interface Facet {
  key: string;
  label: string;
  count: number;
  makeKey?: string;
}

function priceRange(carts: FilterableCart[]): { min: number | null; max: number | null } {
  const prices = carts.map((cart) => cart.price).filter((price): price is number => typeof price === "number");
  return { min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null };
}

/* ------------------------------------------------------------- index page --- */

export function renderBrandsIndex(snapshot: Snapshot): string {
  const path = "/brands/";
  const makes = snapshot.facets.makes;

  const rows = makes.map((make) => {
    const carts = snapshot.carts.filter((cart) => cart.make === make.key);
    const { min, max } = priceRange(carts);
    const models = snapshot.facets.models.filter((model) => model.makeKey === make.key).length;
    return [
      make.label,
      String(make.count),
      String(models),
      min && max ? `${formatPrice(min)} – ${formatPrice(max)}` : "Call",
    ];
  });

  const answer =
    `We carry ${makes.length} golf cart brands: ${makes.map((make) => make.label).join(", ")}. ` +
    `Across them there are ${snapshot.summary.total} carts in stock covering ${snapshot.facets.models.length} ` +
    `distinct models, from ${formatPrice(snapshot.summary.priceMin as number)} to ` +
    `${formatPrice(snapshot.summary.priceMax as number)}.`;

  const faqEntries = pickFaq(["brands", "buying", "pricing"], 5);

  const body = `<div class="page-head">
  <div class="wrap">
    <p class="eyebrow">${esc(salesEvent.name)}</p>
    <h1>Golf Cart Brands We Carry</h1>
${answerBlock("Which golf cart brands do you sell?", esc(answer), snapshot.updatedAt.slice(0, 10))}
${statStrip([
    { value: String(makes.length), label: "brands" },
    { value: String(snapshot.facets.models.length), label: "models" },
    { value: String(snapshot.summary.total), label: "carts in stock" },
  ])}
  </div>
</div>

<section class="section">
  <div class="wrap wrap-narrow prose">
    <h2>Brands and current stock</h2>
${comparisonTable(["Brand", "In stock", "Models", "Price range"], rows, "Golf cart brands in current inventory")}
    <p>Every figure above is read from our dealer management system, so a brand showing one cart genuinely has one cart. If the brand you want is thin, call ${esc(site.phone)} — we source weekly across all ${snapshot.stores.length} locations.</p>
  </div>
</section>

<section class="section section--surface">
  <div class="wrap">
    <ul class="link-grid link-grid--cards">
${makes
  .map(
    (make) =>
      `      <li><a href="${esc(withBase(`/brands/${brandSlug(make.key)}/`))}">${esc(make.label)} golf carts for sale (${make.count})</a></li>`,
  )
  .join("\n")}
    </ul>
  </div>
</section>

${relatedLinks("Or shop by category", [
    { href: "/inventory/new/", label: "New golf carts for sale" },
    { href: "/inventory/used/", label: "Used and pre-owned golf carts" },
    { href: "/inventory/street-legal/", label: "Street legal golf carts and LSVs" },
    { href: "/inventory/utility/", label: "Utility golf carts" },
    { href: "/golf-carts-for-sale/", label: "Every golf cart for sale" },
  ])}
${faqSection(faqEntries)}
${ctaBand()}`;

  return renderPage({
    path,
    title: clamp(`Golf Cart Brands — ${makes.length} Makes in Stock`, 60),
    description: clamp(
      `${makes.length} golf cart brands and ${snapshot.facets.models.length} models in stock: ${makes.slice(0, 5).map((make) => make.label).join(", ")} and more. Compare prices and call ${site.phone}.`,
      155,
    ),
    body,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: path, label: "Brands" },
    ],
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    nodes: [
      collectionPageNode({
        path,
        title: `Golf Cart Brands`,
        description: `${makes.length} golf cart brands in stock`,
        modifiedAt: snapshot.updatedAt,
        total: makes.length,
      }),
      faqNode(path, faqEntries),
    ],
  });
}

/* ------------------------------------------------------------ brand page --- */

export function renderBrandPage(make: Facet, snapshot: Snapshot): string {
  const path = `/brands/${brandSlug(make.key)}/`;
  const carts = snapshot.carts.filter((cart) => cart.make === make.key);
  const models = snapshot.facets.models.filter((model) => model.makeKey === make.key);
  const { min, max } = priceRange(carts);
  const counts = {
    new: carts.filter((cart) => cart.condition === "new").length,
    used: carts.filter((cart) => cart.condition === "used").length,
    electric: carts.filter((cart) => cart.fuel === "electric").length,
    lifted: carts.filter((cart) => cart.features.includes("lifted")).length,
    streetLegal: carts.filter((cart) => cart.features.includes("street-legal")).length,
    lithium: carts.filter((cart) => cart.battery === "lithium").length,
  };
  const cities = [...new Set(carts.map((cart) => cart.city).filter(Boolean))];

  const answer =
    `We have ${make.count} ${make.label} golf cart${make.count === 1 ? "" : "s"} in stock` +
    `${models.length ? ` across ${models.length} model${models.length === 1 ? "" : "s"}` : ""}` +
    `${min && max ? `, priced ${min === max ? formatPrice(min) : `${formatPrice(min)} to ${formatPrice(max)}`}` : ""}. ` +
    `That breaks down as ${counts.new} new and ${counts.used} used` +
    `${counts.lithium ? `, with ${counts.lithium} on lithium packs` : ""}` +
    `${cities.length ? `, held at ${cities.length} location${cities.length === 1 ? "" : "s"}` : ""}.`;

  const faqEntries = [
    {
      q: `How many ${make.label} golf carts do you have?`,
      a: `${make.count} in stock as of ${snapshot.updatedAt.slice(0, 10)}${models.length ? `, across ${models.length} model${models.length === 1 ? "" : "s"}: ${models.map((model) => model.label).join(", ")}` : ""}. The count comes straight from our dealer management system, which the site re-reads every six hours.`,
    },
    ...(min && max
      ? [
          {
            q: `What does a ${make.label} golf cart cost?`,
            a: `Our current ${make.label} stock runs ${min === max ? formatPrice(min) : `${formatPrice(min)} to ${formatPrice(max)}`}. At the event's 0% APR for 48 months that is roughly $${Math.round(min / 48)}${min === max ? "" : ` to $${Math.round(max / 48)}`} a month. Condition, battery chemistry and whether the cart is street legal drive most of the spread.`,
          },
        ]
      : []),
    ...(counts.streetLegal
      ? [
          {
            q: `Are any ${make.label} carts street legal?`,
            a: `${counts.streetLegal} of our ${make.count} ${make.label} carts are built to Low Speed Vehicle specification — lights, signals, mirrors, seat belts, a windshield and a VIN — so they can be titled and registered where LSVs are permitted.`,
          },
        ]
      : []),
    ...pickFaq(["buying", "delivery"], 2),
  ];

  const body = `<div class="page-head">
  <div class="wrap">
    <p class="eyebrow">${esc(salesEvent.name)}</p>
    <h1>${esc(make.label)} Golf Carts for Sale</h1>
${answerBlock(`What ${make.label} golf carts are in stock?`, esc(answer), snapshot.updatedAt.slice(0, 10))}
${statStrip([
    { value: String(make.count), label: "in stock" },
    { value: min ? formatPrice(min) : "—", label: "from" },
    { value: String(models.length), label: models.length === 1 ? "model" : "models" },
    { value: String(counts.electric), label: "electric" },
  ])}
  </div>
</div>

${models.length
    ? `<section class="section section--tight">
  <div class="wrap">
    <h2>${esc(make.label)} models in stock</h2>
    <ul class="link-grid">
${models
  .map(
    (model) =>
      `      <li><a href="${esc(withBase(`/brands/${brandSlug(make.key)}/${model.key}/`))}">${esc(make.label)} ${esc(model.label)} (${model.count})</a></li>`,
  )
  .join("\n")}
    </ul>
  </div>
</section>`
    : ""}

<section class="section">
  <div class="wrap">
    <div class="section-head"><h2>Every ${esc(make.label)} cart on our floors</h2></div>
    <div class="grid-carts">
${carts.slice(0, 24).map((cart, index) => cartCard(cart as never, index < 4)).join("\n")}
    </div>
${carts.length > 24
    ? `    <p><a href="${esc(withBase(`/inventory/?make=${make.key}`))}">See all ${carts.length} ${esc(make.label)} golf carts</a></p>`
    : ""}
  </div>
</section>

<section class="section section--surface">
  <div class="wrap wrap-narrow prose">
    <h2>What is ${esc(make.label)} known for?</h2>
    <p>${esc(brandBlurb(make.key, make.label))}</p>
    <h2>How does our ${esc(make.label)} stock break down?</h2>
    <ul>
      <li>${counts.new} new and ${counts.used} used or pre-owned.</li>
      <li>${counts.electric} electric${counts.electric !== make.count ? ` and ${make.count - counts.electric} gas` : ""}${counts.lithium ? `, ${counts.lithium} on lithium packs` : ""}.</li>
${counts.lifted ? `      <li>${counts.lifted} lifted, on all-terrain tires.</li>` : ""}
${counts.streetLegal ? `      <li>${counts.streetLegal} built to street-legal LSV specification.</li>` : ""}
${cities.length ? `      <li>Held at ${cities.join(", ")}.</li>` : ""}
    </ul>
  </div>
</section>

${relatedLinks(
    "Other brands in stock",
    snapshot.facets.makes
      .filter((entry) => entry.key !== make.key)
      .map((entry) => ({ href: `/brands/${brandSlug(entry.key)}/`, label: `${entry.label} golf carts (${entry.count})` })),
  )}
${faqSection(faqEntries, `${make.label} golf carts: questions and answers`)}
${ctaBand(
    `Looking for a specific ${make.label}?`,
    `Call ${site.phone} and we will check ${make.label} stock and inbound allocation across all ${snapshot.stores.length} locations.`,
  )}`;

  return renderPage({
    path,
    title: clamp(`${make.label} Golf Carts for Sale — ${make.count} in Stock`, 60),
    description: clamp(
      `${make.count} ${make.label} golf cart${make.count === 1 ? "" : "s"} for sale${min ? ` from ${formatPrice(min)}` : ""}. ` +
        `${[counts.new ? `${counts.new} new` : "", counts.used ? `${counts.used} used` : "", counts.streetLegal ? `${counts.streetLegal} street legal` : ""].filter(Boolean).join(", ")}. ` +
        `0% APR for 48 months.`,
      155,
    ),
    body,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: "/brands/", label: "Brands" },
      { href: path, label: make.label },
    ],
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    head: `<meta name="keywords" content="${esc([`${make.label} golf carts`, `${make.label} golf carts for sale`, `used ${make.label} golf cart`, `new ${make.label} golf cart`].join(", "))}">`,
    nodes: [
      collectionPageNode({
        path,
        title: `${make.label} Golf Carts for Sale`,
        description: `${make.count} ${make.label} golf carts in stock`,
        modifiedAt: snapshot.updatedAt,
        total: make.count,
      }),
      itemListNode(path, carts.slice(0, 24), make.count),
      faqNode(path, faqEntries),
    ],
  });
}

/* ------------------------------------------------------------ model page --- */

export function renderModelPage(make: Facet, model: Facet, snapshot: Snapshot): string {
  const path = `/brands/${brandSlug(make.key)}/${model.key}/`;
  const carts = snapshot.carts.filter((cart) => cart.make === make.key && cart.model === model.key);
  const { min, max } = priceRange(carts);
  const name = `${make.label} ${model.label}`;
  const years = [...new Set(carts.map((cart) => cart.year).filter(Boolean))].sort() as number[];
  const colors = [...new Set(carts.map((cart) => cart.colorLabel).filter(Boolean))];
  const seats = [...new Set(carts.map((cart) => cart.passengersLabel).filter(Boolean))];
  const counts = {
    new: carts.filter((cart) => cart.condition === "new").length,
    used: carts.filter((cart) => cart.condition === "used").length,
    lifted: carts.filter((cart) => cart.features.includes("lifted")).length,
    streetLegal: carts.filter((cart) => cart.features.includes("street-legal")).length,
    lithium: carts.filter((cart) => cart.battery === "lithium").length,
  };

  const answer =
    `We have ${carts.length} ${name} golf cart${carts.length === 1 ? "" : "s"} in stock` +
    `${min && max ? `, priced ${min === max ? formatPrice(min) : `${formatPrice(min)} to ${formatPrice(max)}`}` : ""}` +
    `${years.length ? `, model years ${years[0]}${years.length > 1 ? ` to ${years[years.length - 1]}` : ""}` : ""}. ` +
    `${counts.new} new and ${counts.used} used` +
    `${seats.length ? `, in ${seats.join(" and ").toLowerCase()} configuration` : ""}.`;

  const faqEntries = [
    {
      q: `What does a ${name} cost?`,
      a: min && max
        ? `Our ${carts.length} in stock run ${min === max ? formatPrice(min) : `${formatPrice(min)} to ${formatPrice(max)}`} — about $${Math.round(min / 48)}${min === max ? "" : ` to $${Math.round(max / 48)}`} a month at 0% APR over 48 months. Condition and battery chemistry account for most of the difference.`
        : `Call ${site.phone} for current ${name} pricing; the carts we hold are not individually priced online.`,
    },
    {
      q: `What configurations of the ${name} do you have?`,
      a: `${seats.length ? `Seating: ${seats.join(", ")}. ` : ""}${colors.length ? `Colours in stock: ${colors.slice(0, 6).join(", ")}${colors.length > 6 ? ` and ${colors.length - 6} more` : ""}. ` : ""}${counts.lifted ? `${counts.lifted} lifted. ` : ""}${counts.streetLegal ? `${counts.streetLegal} street legal. ` : ""}${counts.lithium ? `${counts.lithium} on lithium packs.` : ""}`.trim(),
    },
    ...pickFaq(["buying", "batteries"], 2),
  ];

  const body = `<div class="page-head">
  <div class="wrap">
    <p class="eyebrow"><a href="${esc(withBase(`/brands/${brandSlug(make.key)}/`))}">${esc(make.label)}</a></p>
    <h1>${esc(name)} Golf Carts for Sale</h1>
${answerBlock(`What ${name} carts are available?`, esc(answer), snapshot.updatedAt.slice(0, 10))}
${statStrip([
    { value: String(carts.length), label: "in stock" },
    { value: min ? formatPrice(min) : "—", label: "from" },
    ...(years.length ? [{ value: years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0]), label: "model years" }] : []),
  ])}
  </div>
</div>

<section class="section">
  <div class="wrap">
    <div class="grid-carts">
${carts.map((cart, index) => cartCard(cart as never, index < 4)).join("\n")}
    </div>
  </div>
</section>

<section class="section section--surface">
  <div class="wrap wrap-narrow prose">
    <h2>About the ${esc(name)}</h2>
    <p>${esc(brandBlurb(make.key, make.label))} This page lists only ${esc(name)} carts actually on our floors — ${carts.length} of them as of ${esc(snapshot.updatedAt.slice(0, 10))}. For the rest of the range see <a href="${withBase(`/brands/${brandSlug(make.key)}/`)}">all ${esc(make.label)} golf carts</a>.</p>
${colors.length ? `    <p><strong>Colours in stock:</strong> ${esc(colors.join(", "))}.</p>` : ""}
  </div>
</section>

${relatedLinks(
    `Other ${make.label} models`,
    snapshot.facets.models
      .filter((entry) => entry.makeKey === make.key && entry.key !== model.key)
      .map((entry) => ({
        href: `/brands/${brandSlug(make.key)}/${entry.key}/`,
        label: `${make.label} ${entry.label} (${entry.count})`,
      })),
  )}
${faqSection(faqEntries, `${name}: questions and answers`)}
${ctaBand(`Want a ${name} we do not have?`, `Call ${site.phone} — we source ${make.label} stock weekly and can often match a configuration inside a fortnight.`)}`;

  return renderPage({
    path,
    title: clamp(`${name} for Sale — ${carts.length} in Stock`, 60),
    description: clamp(
      `${carts.length} ${name} golf cart${carts.length === 1 ? "" : "s"} for sale${min ? ` from ${formatPrice(min)}` : ""}. ` +
        `${[counts.new ? `${counts.new} new` : "", counts.used ? `${counts.used} used` : ""].filter(Boolean).join(", ")}. ` +
        `0% APR for 48 months. Call ${site.phone}.`,
      155,
    ),
    body,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: "/brands/", label: "Brands" },
      { href: `/brands/${brandSlug(make.key)}/`, label: make.label },
      { href: path, label: model.label },
    ],
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    head: `<meta name="keywords" content="${esc([`${name} for sale`, `${name} price`, `used ${name}`, `${make.label} golf carts`].join(", "))}">`,
    nodes: [
      collectionPageNode({
        path,
        title: `${name} for Sale`,
        description: `${carts.length} ${name} golf carts in stock`,
        modifiedAt: snapshot.updatedAt,
        total: carts.length,
      }),
      itemListNode(path, carts, carts.length),
      faqNode(path, faqEntries),
    ],
  });
}

/**
 * One factual sentence per brand.
 *
 * Kept short and specific rather than promotional: a generic paragraph is
 * exactly what does not get cited in an AI answer.
 */
function brandBlurb(key: string, label: string): string {
  const blurbs: Record<string, string> = {
    club_car: "Club Car has built golf cars in Georgia since 1958 and is the fleet standard on a large share of American courses; the aluminium frame is the reason its used carts hold value.",
    ezgo: "E-Z-GO, part of Textron, is the other half of the American fleet duopoly, known for the RXV and TXT platforms and for parts availability that makes older carts economic to keep running.",
    yamaha: "Yamaha's Drive and G-series carts have a reputation for the quietest gas drivetrain in the category, which is why they persist on courses that never electrified.",
    denago: "Denago EV builds street-legal lithium carts to LSV specification from the factory, so its Nomad and Rover models arrive already titled rather than needing an upfit.",
    icon: "ICON EV specialises in lifted, feature-loaded lithium carts sold at a lower price point than the legacy brands, which has made it one of the fastest-growing names in the category.",
    cushman: "Cushman is Textron's utility line — cargo beds, higher payloads and the Hauler series — bought by grounds crews and municipalities rather than golfers.",
    bintelli: "Bintelli builds street-legal LSVs in South Carolina, factory-equipped with lights, belts and a VIN so the cart can be registered without an aftermarket package.",
    epic: "Epic Carts builds lifted lithium LSVs with long-travel suspension, aimed at beach and rural buyers who want clearance without a custom build.",
    swift_ev: "Swift EV is a newer entrant building lithium LSVs with an emphasis on cabin space and higher seat counts.",
    tara: "Tara builds value-priced electric carts, generally with lead-acid packs, for buyers who want a new cart with a warranty rather than the lowest lifetime cost.",
    teko_ev: "TEKO EV builds lithium-powered street-legal carts with a focus on the six-passenger transport configuration.",
  };
  return blurbs[key] ?? `${label} carts appear on our floors regularly; the units listed here are the ones in stock today.`;
}
