/**
 * Location pages — the service-area cluster named in the brief.
 *
 *   /locations/                       index with every dealership
 *   /locations/<slug>/                one dealership: NAP, geo, service area
 *   /locations/<slug>/inventory/      that location's stock as a listing page
 *
 * The NAP block on each page renders from the same fields the LocalBusiness
 * schema reads, so the visible address, the `tel:` href and the structured data
 * cannot drift apart (Phase 7 entity consistency).
 */

import { site, salesEvent } from "../../src/config/site.ts";
import { esc, withBase, formatPrice, clamp } from "../lib/util.ts";
import { renderPage } from "../lib/layout.ts";
import { cartCard, ctaBand, faqSection, answerBlock, statStrip, relatedLinks, specTable } from "../lib/components.ts";
import { dealerNode, itemListNode, collectionPageNode, faqNode, type Store } from "../lib/schema.ts";
import { pickFaq, type Snapshot } from "./inventory.ts";
import { testimonials } from "../../src/config/testimonials.ts";

/* ------------------------------------------------------------- index page --- */

export function renderLocationsIndex(snapshot: Snapshot): string {
  const path = "/locations/";
  const stores = [...snapshot.stores].sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city));
  const states = [...new Set(stores.map((store) => store.state))].sort();
  const stocked = stores.filter((store) => store.cartCount > 0);

  const answer =
    `We operate ${stores.length} golf cart dealerships across ${states.length} states: ` +
    `${states.join(", ")}. All of them draw on one shared inventory of ${snapshot.summary.total} carts, so a cart ` +
    `listed at one location can usually be moved to another. Every location is open ${site.hoursSummary.toLowerCase()}`;

  const faqEntries = [
    {
      q: "Where are your golf cart dealerships?",
      a: `${stores.length} locations across ${states.length} states: ${stores.map((store) => `${store.city}, ${store.stateCode}`).join("; ")}. All share one inventory, so stock at any lot can normally be transferred to the one nearest you.`,
    },
    {
      q: "Can I buy a cart from a location that is not near me?",
      a: `Yes. We deliver locally from each dealership and arrange nationwide transport for carts bought at distance. Delivery is quoted by mileage — call ${site.phone} with your ZIP code.`,
    },
    ...pickFaq(["delivery", "contact", "inventory"], 3),
  ];

  const body = `<div class="page-head">
  <div class="wrap">
    <p class="eyebrow">${esc(salesEvent.name)}</p>
    <h1>Golf Cart Dealership Locations</h1>
${answerBlock("Where can you buy a golf cart from us?", esc(answer), snapshot.updatedAt.slice(0, 10))}
${statStrip([
    { value: String(stores.length), label: "locations" },
    { value: String(states.length), label: "states" },
    { value: String(snapshot.summary.total), label: "carts in stock" },
  ])}
  </div>
</div>

${states
  .map((state) => {
    const inState = stores.filter((store) => store.state === state);
    return `<section class="section section--tight">
  <div class="wrap">
    <h2>Golf carts for sale in ${esc(state)}</h2>
    <div class="grid-3">
${inState
  .map(
    (store) => `      <article class="location-card">
        <h3><a href="${esc(withBase(`/locations/${store.slug}/`))}">${esc(store.city)}, ${esc(store.stateCode)}</a></h3>
        <p class="location-card__meta">${store.cartCount} cart${store.cartCount === 1 ? "" : "s"} in stock${store.county ? ` &middot; ${esc(store.county)}` : ""}</p>
${store.address1 ? `        <p class="location-card__address">${esc(store.address1)}${store.address2 ? `, ${esc(store.address2)}` : ""}<br>${esc(store.city)}, ${esc(store.stateCode)} ${esc(store.postalCode)}</p>` : ""}
        <p><a class="btn btn--outline btn--sm" href="${esc(site.phoneTel)}">Call ${esc(site.phone)}</a></p>
${store.cartCount > 0 ? `        <p><a href="${esc(withBase(`/locations/${store.slug}/inventory/`))}">Browse ${store.cartCount} golf carts in ${esc(store.city)}</a></p>` : ""}
      </article>`,
  )
  .join("\n")}
    </div>
  </div>
</section>`;
  })
  .join("\n")}

<section class="section section--surface">
  <div class="wrap wrap-narrow prose">
    <h2>How does one shared inventory work?</h2>
    <p>Every cart on this site sits in one dealer management system, whichever lot it physically stands on. When you call ${esc(site.phone)} the specialist can see all ${snapshot.summary.total} carts at once, so if the configuration you want is at another location it can usually be transferred rather than ordered. ${stocked.length} of our ${stores.length} locations have stock on the floor today.</p>
    <h2>Hours</h2>
${specTable(site.hoursDisplay.map((row) => [row.label, row.value] as [string, string]), "Dealership hours, all locations")}
  </div>
</section>

${faqSection(faqEntries)}
${ctaBand()}`;

  return renderPage({
    path,
    title: clamp(`Golf Cart Dealerships — ${stores.length} Locations`, 60),
    description: clamp(
      `${stores.length} golf cart dealership locations across ${states.length} states with ${snapshot.summary.total} carts in one shared inventory. Delivery available. Call ${site.phone}.`,
      155,
    ),
    body,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: path, label: "Locations" },
    ],
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    nodes: [
      collectionPageNode({
        path,
        title: "Golf Cart Dealership Locations",
        description: `${stores.length} locations`,
        modifiedAt: snapshot.updatedAt,
        total: stores.length,
      }),
      ...stores.map((store) => dealerNode(store)),
      faqNode(path, faqEntries),
    ],
  });
}

/* ---------------------------------------------------------- location page --- */

export function renderLocationPage(store: Store, snapshot: Snapshot): string {
  const path = `/locations/${store.slug}/`;
  const carts = snapshot.carts.filter((cart) => cart.location === store.slug);
  const prices = carts.map((cart) => cart.price).filter((price): price is number => typeof price === "number");
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const counts = {
    new: carts.filter((cart) => cart.condition === "new").length,
    used: carts.filter((cart) => cart.condition === "used").length,
    electric: carts.filter((cart) => cart.fuel === "electric").length,
    streetLegal: carts.filter((cart) => cart.features.includes("street-legal")).length,
    lifted: carts.filter((cart) => cart.features.includes("lifted")).length,
  };
  const review = testimonials.find((entry) => entry.location === store.slug);
  const nearby = snapshot.stores
    .filter((entry) => entry.slug !== store.slug && entry.state === store.state)
    .slice(0, 6);

  const answer =
    `Our ${store.city}, ${store.stateCode} golf cart dealership has ${store.cartCount} cart${store.cartCount === 1 ? "" : "s"} ` +
    `on the floor${min && max ? `, priced ${formatPrice(min)} to ${formatPrice(max)}` : ""}, and can draw on all ` +
    `${snapshot.summary.total} carts in our shared inventory. It is open ${site.hoursSummary.toLowerCase()} ` +
    `Call ${site.phone}.`;

  const faqEntries = [
    {
      q: `How many golf carts are in stock in ${store.city}?`,
      a: `${store.cartCount} as of ${snapshot.updatedAt.slice(0, 10)}${counts.new || counts.used ? ` — ${counts.new} new and ${counts.used} used` : ""}. Beyond that, this location can pull from all ${snapshot.summary.total} carts across our ${snapshot.stores.length} dealerships, so ask even if what you want is not listed here.`,
    },
    {
      q: `What areas does the ${store.city} location serve?`,
      a: store.serviceArea?.length
        ? `${store.serviceArea.join(", ")}${store.county ? `, and the wider ${store.county} area` : ""}. We deliver locally from ${store.city} and arrange transport further afield.`
        : `${store.city} and the surrounding ${store.state} area, with local delivery and nationwide transport available.`,
    },
    {
      q: `What are the ${store.city} hours?`,
      a: `${site.hoursSummary} Call ${site.phone} before travelling if you want a specific cart held.`,
    },
    ...pickFaq(["delivery", "trade-in"], 2),
  ];

  const body = `<div class="page-head">
  <div class="wrap">
    <p class="eyebrow">${esc(salesEvent.name)}</p>
    <h1>Golf Carts for Sale in ${esc(store.city)}, ${esc(store.stateCode)}</h1>
${answerBlock(`What is at the ${store.city} golf cart dealership?`, esc(answer), snapshot.updatedAt.slice(0, 10))}
${statStrip([
    { value: String(store.cartCount), label: "on this lot" },
    { value: min ? formatPrice(min) : "—", label: "from" },
    { value: String(snapshot.summary.total), label: "in shared stock" },
  ])}
  </div>
</div>

<section class="section">
  <div class="wrap location-detail">
    <div>
      <h2>Contact and hours</h2>
${specTable(
    [
      ["Location", store.name],
      ["Address", store.address1 ? [store.address1, store.address2].filter(Boolean).join(", ") : ""],
      ["City", `${store.city}, ${store.stateCode} ${store.postalCode}`.trim()],
      ["County", store.county ?? ""],
      ["Phone", site.phone],
      ["Hours", site.hoursSummary],
      ["Carts in stock", String(store.cartCount)],
    ],
    `${store.name} contact details`,
  )}
      <p class="location-detail__cta">
        <a class="btn btn--primary btn--lg" href="${esc(site.phoneTel)}" data-testid="link-location-phone">Call ${esc(site.phone)}</a>
${store.lat !== null && store.lng !== null
    ? `        <a class="btn btn--outline btn--lg" href="https://www.google.com/maps/search/?api=1&amp;query=${store.lat},${store.lng}" rel="noopener noreferrer" target="_blank">Get directions</a>`
    : ""}
      </p>
    </div>
    <div>
      <h2>Areas served from ${esc(store.city)}</h2>
${store.serviceArea?.length
    ? `      <ul class="tag-list">
${store.serviceArea.map((area) => `        <li>${esc(area)}</li>`).join("\n")}
      </ul>`
    : `      <p>${esc(store.city)} and the surrounding ${esc(store.state)} area.</p>`}
      <p>Local delivery runs from this lot; nationwide transport is quoted by mileage. See <a href="${esc(withBase("/delivery/"))}">golf cart delivery</a>.</p>
${review
    ? `      <blockquote class="testimonial">
        <p>${esc(review.body)}</p>
        <footer>${esc(review.name)}, ${esc(review.city)} ${esc(review.stateCode)} &middot; ${review.rating}/5 &middot; bought a ${esc(review.cart)}</footer>
      </blockquote>`
    : ""}
    </div>
  </div>
</section>

${carts.length
    ? `<section class="section section--surface">
  <div class="wrap">
    <div class="section-head"><h2>Golf carts on the ${esc(store.city)} lot</h2></div>
    <div class="grid-carts">
${carts.slice(0, 12).map((cart, index) => cartCard(cart as never, index < 4)).join("\n")}
    </div>
    <p><a href="${esc(withBase(`/locations/${store.slug}/inventory/`))}">Browse all ${carts.length} golf carts in ${esc(store.city)}, ${esc(store.stateCode)}</a></p>
  </div>
</section>`
    : `<section class="section section--surface">
  <div class="wrap wrap-narrow">
    <div class="empty-state">
      <h2>Nothing on this lot today</h2>
      <p>The ${esc(store.city)} location has no carts standing on it right now, but it can pull from all ${snapshot.summary.total} carts in our shared inventory. Call ${esc(site.phone)} and we will find one and move it here.</p>
      <p><a class="btn btn--primary" href="${esc(site.phoneTel)}">Call ${esc(site.phone)}</a></p>
    </div>
  </div>
</section>`}

<section class="section">
  <div class="wrap wrap-narrow prose">
    <h2>What can you buy in ${esc(store.city)}?</h2>
    <p>${store.cartCount > 0
      ? `${counts.new} new and ${counts.used} used carts are on this lot, ${counts.electric} of them electric${counts.streetLegal ? `, ${counts.streetLegal} built to street-legal LSV specification` : ""}${counts.lifted ? ` and ${counts.lifted} lifted` : ""}. Prices run ${formatPrice(min!)} to ${formatPrice(max!)}.`
      : `This location sells from the shared inventory rather than holding floor stock at the moment.`} Every cart is at ${esc(salesEvent.name)} pricing with 0% APR available for 48 months.</p>
    <h2>Golf cart categories available here</h2>
    <ul>
      <li><a href="${esc(withBase("/inventory/new/"))}">New golf carts</a> — full factory warranty and a current-generation battery pack.</li>
      <li><a href="${esc(withBase("/inventory/used/"))}">Used and pre-owned golf carts</a> — inspected, reconditioned, battery year published.</li>
      <li><a href="${esc(withBase("/inventory/street-legal/"))}">Street legal golf carts and LSVs</a> — titled and registerable where permitted.</li>
      <li><a href="${esc(withBase("/inventory/utility/"))}">Utility golf carts</a> — cargo beds for grounds and property work.</li>
    </ul>
  </div>
</section>

${relatedLinks(
    nearby.length ? `Other ${store.state} locations` : "All locations",
    (nearby.length ? nearby : snapshot.stores.filter((entry) => entry.slug !== store.slug).slice(0, 8)).map((entry) => ({
      href: `/locations/${entry.slug}/`,
      label: `Golf carts in ${entry.city}, ${entry.stateCode} (${entry.cartCount})`,
    })),
  )}
${faqSection(faqEntries, `${store.city} golf carts: questions and answers`)}
${ctaBand(
    `Visiting the ${store.city} lot?`,
    `Call ${site.phone} first and we will hold the cart you want and confirm it is on this lot rather than another.`,
  )}`;

  return renderPage({
    path,
    title: clamp(`Golf Carts in ${store.city}, ${store.stateCode} — ${store.cartCount} in Stock`, 60),
    description: clamp(
      `Golf carts for sale in ${store.city}, ${store.state}. ${store.cartCount} on the lot${min ? ` from ${formatPrice(min)}` : ""}, ${snapshot.summary.total} in shared stock. 0% APR. Call ${site.phone}.`,
      155,
    ),
    body,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: "/locations/", label: "Locations" },
      { href: path, label: `${store.city}, ${store.stateCode}` },
    ],
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    head: `<meta name="keywords" content="${esc(
      [
        ...(store.keywords ?? []),
        `golf carts for sale ${store.city} ${store.stateCode}`,
        `golf cart dealer near ${store.city}`,
        `${store.city} golf cart dealership`,
      ].join(", "),
    )}">`,
    nodes: [dealerNode(store), ...(carts.length ? [itemListNode(path, carts.slice(0, 12), carts.length)] : []), faqNode(path, faqEntries)],
  });
}
