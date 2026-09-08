/**
 * Home page, the Memorial Day event page, and the pillar page.
 *
 * The pillar page at /golf-carts-for-sale/ is the page the brief's ten primary
 * phrases are meant to converge on: it defines the category, links out to every
 * cluster page with descriptive anchor text, and carries the FAQPage markup.
 * Every cluster page links back to it, so the internal linking is a hub rather
 * than a chain.
 */

import { site, salesEvent, keywords } from "../../src/config/site.ts";
import { esc, withBase, formatPrice, monthlyPayment, clamp } from "../lib/util.ts";
import { renderPage } from "../lib/layout.ts";
import {
  cartCard, ctaBand, faqSection, answerBlock, statStrip, relatedLinks,
  comparisonTable, specTable,
} from "../lib/components.ts";
import { faqNode, saleEventNode, itemListNode, type Crumb, type Store } from "../lib/schema.ts";
import { preloadCartImage } from "../lib/images.ts";
import { pickFaq, type Snapshot } from "./inventory.ts";
import { faq } from "../../src/config/faq.ts";
import { guides } from "../../src/config/guides.ts";

const CURRENT_YEAR = new Date().getUTCFullYear();

/** The cluster of category pages the pillar links to, with real counts. */
function clusterLinks(snapshot: Snapshot): Array<{ href: string; label: string }> {
  const summary = snapshot.summary as Record<string, number>;
  return [
    { href: "/inventory/new/", label: `New golf carts for sale (${summary.new})` },
    { href: "/inventory/used/", label: `Used and pre-owned golf carts (${summary.used})` },
    { href: "/inventory/street-legal/", label: `Street legal golf carts and low speed vehicles (${summary.streetLegal})` },
    { href: "/inventory/utility/", label: `Utility golf carts with cargo beds (${summary.utility})` },
    { href: "/inventory/fleet/", label: "Fleet golf carts for resorts and communities" },
    { href: "/inventory/lifted/", label: `Lifted golf carts on all-terrain tires (${summary.lifted})` },
    { href: "/inventory/4x4/", label: `4x4 golf carts with four-wheel drive (${summary.fourByFour})` },
    { href: "/inventory/all-terrain/", label: `Off-road and all-terrain golf carts (${summary.allTerrain})` },
    { href: "/inventory/electric/", label: `Electric golf carts (${summary.electric})` },
    { href: "/inventory/gas/", label: `Gas golf carts (${summary.gas})` },
    { href: "/inventory/lithium/", label: `Lithium golf carts (${summary.lithium})` },
    { href: "/brands/", label: "Golf cart brands and models we carry" },
    { href: "/locations/", label: `Golf cart dealerships near you (${snapshot.stores.length} locations)` },
  ];
}

function featured(snapshot: Snapshot, count = 8) {
  return snapshot.carts.slice(0, count);
}

function heroStats(snapshot: Snapshot) {
  const summary = snapshot.summary as Record<string, number>;
  return [
    { value: String(summary.total), label: "carts in stock" },
    { value: summary.priceMin ? formatPrice(summary.priceMin) : "—", label: "starting price" },
    { value: "0%", label: "APR for 48 months" },
    { value: String(snapshot.stores.length), label: "locations" },
  ];
}

/* ------------------------------------------------------------------ home --- */

export function renderHomePage(snapshot: Snapshot): string {
  const summary = snapshot.summary as Record<string, number>;
  const states = new Set(snapshot.stores.map((store) => store.state)).size;

  const answer =
    `Memorial Day Golf Carts runs the Memorial Day Golf Cart Sales Event, with ${summary.total} new, used and ` +
    `pre-owned golf carts in stock across ${snapshot.stores.length} dealerships in ${states} states. Prices run ` +
    `${formatPrice(summary.priceMin)} to ${formatPrice(summary.priceMax)} with 0% APR for 48 months, and stock ` +
    `covers street legal LSVs, lifted, utility and fleet carts.`;

  const faqEntries = pickFaq(["event", "pricing", "financing", "inventory"], 6);

  const body = `<section class="hero">
  <div class="wrap hero__inner">
    <p class="eyebrow eyebrow--light">${esc(salesEvent.name)} &middot; ${CURRENT_YEAR}</p>
    <h1>${esc(salesEvent.headline)}</h1>
    <p class="hero__lede">${esc(salesEvent.subhead)}</p>
${answerBlock("What is the Memorial Day Golf Cart Sales Event?", esc(answer), snapshot.updatedAt.slice(0, 10))}
    <div class="hero__actions">
      <a class="btn btn--primary btn--lg" href="${esc(site.phoneTel)}" data-testid="link-hero-phone">Call ${esc(site.phone)}</a>
      <a class="btn btn--light btn--lg" href="${esc(withBase("/inventory/"))}">Browse ${summary.total} golf carts</a>
    </div>
${statStrip(heroStats(snapshot))}
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <h2>Featured golf carts in the Memorial Day event</h2>
      <p>The highest-specification carts on our floors right now, all at event pricing. <a href="${esc(withBase("/inventory/"))}">See all ${summary.total} golf carts for sale</a>.</p>
    </div>
    <div class="grid-carts">
${featured(snapshot).map((cart, index) => cartCard(cart as never, index === 0)).join("\n")}
    </div>
  </div>
</section>

<section class="section section--surface">
  <div class="wrap">
    <div class="section-head section-head--center">
      <h2>Shop by what you actually need</h2>
    </div>
    <ul class="link-grid link-grid--cards">
${clusterLinks(snapshot)
  .map((link) => `      <li><a href="${esc(withBase(link.href))}">${esc(link.label)}</a></li>`)
  .join("\n")}
    </ul>
  </div>
</section>

<section class="section">
  <div class="wrap wrap-narrow prose">
    <h2>How much does a golf cart cost during the Memorial Day event?</h2>
    <p>Current stock runs ${formatPrice(summary.priceMin)} to ${formatPrice(summary.priceMax)}. Where a cart lands in that range is decided by four things: condition, battery chemistry, seat count and whether it is built to street-legal specification.</p>
${comparisonTable(
    ["Configuration", "Typical price", "At 0% APR / 48 mo"],
    [
      ["Used lead-acid, 2 or 4 seats", `${formatPrice(summary.priceMin)} – $7,000`, `$${Math.round(monthlyPayment(summary.priceMin)!)} – $146/mo`],
      ["Used lithium, 4 seats", "$7,000 – $11,000", "$146 – $229/mo"],
      ["New electric, 4 seats, unlifted", "$9,000 – $12,500", "$188 – $260/mo"],
      ["New lifted lithium, street legal", `$12,500 – ${formatPrice(summary.priceMax)}`, `$260 – $${Math.round(monthlyPayment(summary.priceMax)!)}/mo`],
    ],
    "Golf cart price bands in current stock",
  )}
    <p>Those bands come from the ${summary.priceCount} priced carts on our own floors today, not a national average. Read the <a href="${esc(withBase("/guides/golf-cart-buying-checklist/"))}">golf cart buying checklist</a> before you choose a configuration, and see <a href="${esc(withBase("/financing/"))}">golf cart financing</a> for how the 0% programme works.</p>

    <h2>Why buy during a Memorial Day sales event?</h2>
    <p>Memorial Day weekend is the opening of the golf cart season, and it is the point where spring allocation has landed but the next model year is still months out. Dealers need the floor space, which is why event pricing on in-stock carts is deeper now than at any point until the autumn changeover. It is also when the widest selection exists — ${summary.total} carts across ${snapshot.stores.length} lots, rather than whatever is left in August.</p>

    <h2>What do we actually sell?</h2>
    <ul>
      <li><strong>${summary.new} new golf carts</strong> under full factory warranty, ${summary.lithium} of them on lithium packs.</li>
      <li><strong>${summary.used} used and pre-owned golf carts</strong>, each inspected and reconditioned, with the battery year published on the listing.</li>
      <li><strong>${summary.streetLegal} street legal golf carts</strong> built to Low Speed Vehicle specification and ready to title.</li>
      <li><strong>${summary.lifted} lifted golf carts</strong> and ${summary.allTerrain} on all-terrain tires for beach, farm and trail use.</li>
      <li><strong>${summary.utility} utility golf carts</strong> with cargo beds for grounds, farm and warehouse work.</li>
    </ul>
    <p>Every one of those numbers is read from our dealer management system, which the site re-reads every six hours. Nothing on this site is a catalogue entry — it is a cart standing on a lot.</p>
  </div>
</section>

${relatedLinks(
    "Buying guides",
    guides.map((guide) => ({ href: `/guides/${guide.slug}/`, label: guide.title })),
  )}
${faqSection(faqEntries, "Memorial Day golf cart sales event: questions and answers")}
${ctaBand()}`;

  return renderPage({
    path: "/",
    title: clamp(`Golf Carts for Sale — ${salesEvent.name}`, 60),
    description: clamp(
      `${summary.total} new, used and pre-owned golf carts for sale in the ${salesEvent.name}. Street legal, utility and fleet carts. 0% APR for 48 months. Call ${site.phone}.`,
      155,
    ),
    body,
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    head:
      `<meta name="keywords" content="${esc([...keywords.primary, ...keywords.event.slice(0, 3)].join(", "))}">` +
      `\n${preloadCartImage(featured(snapshot)[0]?.images?.[0], "card")}`,
    nodes: [
      saleEventNode(CURRENT_YEAR, summary.total, summary.priceMin, summary.priceMax),
      itemListNode("/", featured(snapshot), summary.total),
      faqNode("/", faqEntries),
    ],
  });
}

/* ----------------------------------------------------------- event page --- */

export function renderEventPage(snapshot: Snapshot): string {
  const summary = snapshot.summary as Record<string, number>;
  const path = "/memorial-day-golf-cart-sales-event/";
  const faqEntries = pickFaq(["event", "pricing", "financing", "trade-in", "delivery"], 8);

  const answer =
    `The ${salesEvent.name} runs from May 15 to June 2 each year. Every one of the ${summary.total} new and used ` +
    `golf carts in stock carries event pricing, with 0% APR financing for 48 months on approved credit, same-day ` +
    `trade appraisals, and local or nationwide delivery from ${snapshot.stores.length} dealership locations.`;

  const body = `<div class="page-head page-head--event">
  <div class="wrap">
    <p class="eyebrow eyebrow--light">${CURRENT_YEAR}</p>
    <h1>${esc(salesEvent.headline)}</h1>
${answerBlock("When is the Memorial Day Golf Cart Sales Event?", esc(answer), snapshot.updatedAt.slice(0, 10))}
${statStrip(heroStats(snapshot))}
    <div class="hero__actions">
      <a class="btn btn--primary btn--lg" href="${esc(site.phoneTel)}">Call ${esc(site.phone)}</a>
      <a class="btn btn--light btn--lg" href="${esc(withBase("/inventory/"))}">Shop the event</a>
    </div>
  </div>
</div>

<section class="section">
  <div class="wrap wrap-narrow prose">
    <h2>What is included in the event?</h2>
    <ul>
${salesEvent.offers.map((offer) => `      <li>${esc(offer)}</li>`).join("\n")}
    </ul>

    <h2>Are golf carts actually cheaper on Memorial Day?</h2>
    <p>On in-stock carts, yes, and for a structural reason rather than a marketing one. Memorial Day is the start of the use season: spring allocation has arrived, the next model year is months away, and floor space is the constraint. A dealer discounts current stock hardest at exactly that moment. It is also the widest selection of the year — ${summary.total} carts now, against a picked-over floor by late summer.</p>

    <h2>How does the 0% APR financing work?</h2>
    <p>Approved buyers get 0% APR for 48 months, so the payment is simply the price divided by 48 with no interest added. A ${formatPrice(summary.priceMin)} cart is about $${Math.round(monthlyPayment(summary.priceMin)!)} a month; a ${formatPrice(summary.priceMax)} cart about $${Math.round(monthlyPayment(summary.priceMax)!)}. Prequalification is a soft pull with several of our lenders, so checking does not affect your score. See <a href="${esc(withBase("/financing/"))}">financing</a> for the lender list.</p>

    <h2>Event dates and hours</h2>
${specTable(
    [
      ["Event", `${salesEvent.name} ${CURRENT_YEAR}`],
      ["Runs", `May 15 – June 2, ${CURRENT_YEAR}`],
      ["Hours", site.hoursSummary],
      ["Locations", `${snapshot.stores.length} dealerships in ${new Set(snapshot.stores.map((store) => store.state)).size} states`],
      ["Carts in stock", String(summary.total)],
      ["Price range", `${formatPrice(summary.priceMin)} – ${formatPrice(summary.priceMax)}`],
      ["Financing", "0% APR for 48 months on approved credit"],
      ["Phone", site.phone],
    ],
    `${salesEvent.name} details`,
  )}

    <h2>Can I trade in my current cart during the event?</h2>
    <p>Yes, and trade value stacks on top of event pricing rather than replacing it. Appraisals are same-day; bring the cart, the charger and any service records. See <a href="${esc(withBase("/trade-in/"))}">trade in your golf cart</a>.</p>
  </div>
</section>

<section class="section section--surface">
  <div class="wrap">
    <div class="section-head"><h2>Shop the Memorial Day event</h2></div>
    <div class="grid-carts">
${featured(snapshot, 8).map((cart, index) => cartCard(cart as never, index === 0)).join("\n")}
    </div>
  </div>
</section>

${relatedLinks("Every category in the event", clusterLinks(snapshot))}
${faqSection(faqEntries, "Memorial Day event questions")}
${ctaBand()}`;

  return renderPage({
    path,
    title: clamp(`${salesEvent.name} ${CURRENT_YEAR}`, 60),
    description: clamp(
      `The ${salesEvent.name} runs May 15 – June 2. Event pricing on all ${summary.total} carts in stock, 0% APR for 48 months, ${snapshot.stores.length} locations. Call ${site.phone}.`,
      155,
    ),
    body,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: path, label: salesEvent.name },
    ],
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    head:
      `<meta name="keywords" content="${esc(keywords.event.join(", "))}">` +
      `\n${preloadCartImage(featured(snapshot, 8)[0]?.images?.[0], "card")}`,
    nodes: [
      saleEventNode(CURRENT_YEAR, summary.total, summary.priceMin, summary.priceMax),
      faqNode(path, faqEntries),
    ],
  });
}

/* ----------------------------------------------------------- pillar page --- */

/**
 * The pillar page.
 *
 * This is the hub for the ten primary phrases. It defines the category, answers
 * the questions a buyer actually asks, and links to every cluster page with an
 * anchor that describes the destination — no "click here", no exact-match
 * repetition.
 */
export function renderPillarPage(snapshot: Snapshot): string {
  const summary = snapshot.summary as Record<string, number>;
  const path = "/golf-carts-for-sale/";
  const states = new Set(snapshot.stores.map((store) => store.state)).size;

  const faqEntries = [
    {
      q: "What is a golf cart?",
      a: "A golf cart is a small electric or gas vehicle with a top speed of 12 to 25 mph, built for short trips on courses, in communities and around property. A cart equipped to Low Speed Vehicle standard — lights, signals, mirrors, belts, windshield and a VIN — can be titled and driven on roads posted 35 mph or below in most states.",
    },
    {
      q: "How much does a golf cart cost?",
      a: `In our current stock, ${formatPrice(summary.priceMin)} to ${formatPrice(summary.priceMax)}. Used lead-acid carts sit at the bottom, new lifted lithium carts built to street-legal specification at the top. Across ${summary.priceCount} priced carts, most four-passenger electric models land between $9,000 and $12,500.`,
    },
    {
      q: "What is the difference between a golf cart and an LSV?",
      a: "An LSV, or Low Speed Vehicle, is a golf cart that meets Federal Motor Vehicle Safety Standard 500: it reaches 20 to 25 mph and carries headlights, tail and brake lights, turn signals, reflectors, two mirrors, a parking brake, a DOT windshield, seat belts at every seat, and a VIN. That equipment is what makes it registerable for road use.",
    },
    {
      q: "Are new or used golf carts the better buy?",
      a: "New if the cart will be driven most days: the pack is current-generation and under warranty. Used if the cart will see occasional use, provided you price the battery age into the offer — a lead-acid pack past four years is a $900 to $1,800 replacement waiting to happen.",
    },
    {
      q: "What is a utility golf cart?",
      a: "A utility golf cart trades the rear seat for a cargo bed, carrying roughly 400 to 1,200 lb. Grounds crews, farms, warehouses and campgrounds buy them to haul tools and material rather than people.",
    },
    {
      q: "What are fleet golf carts?",
      a: "Fleet carts are bought in quantity and specified for uptime rather than features — resort transport, course rental, campground shuttles, community security. In practice that means six-passenger people-movers and utility cargo models, usually on lithium because it charges in three to five hours and tolerates partial charges.",
    },
    {
      q: "Lithium or lead-acid?",
      a: "Lithium gives 45 to 60 miles per charge, 3,000 to 5,000 cycles, half the weight and no watering. Lead-acid gives 25 to 40 miles, 500 to 1,000 cycles, and costs less up front. For regular use lithium is recovered over the life of the cart; for a few weekends a year, lead-acid is the rational choice.",
    },
    ...pickFaq(["street-legal", "delivery", "financing"], 3),
  ];

  const answer =
    `A golf cart is a small electric or gas vehicle topping out at 12 to 25 mph. We have ${summary.total} for sale — ` +
    `${summary.new} new and ${summary.used} used — from ${formatPrice(summary.priceMin)} to ${formatPrice(summary.priceMax)}, ` +
    `across ${snapshot.stores.length} dealerships in ${states} states, including street legal LSVs, utility, fleet, ` +
    `lifted and all-terrain configurations.`;

  const body = `<div class="page-head">
  <div class="wrap">
    <p class="eyebrow">${esc(salesEvent.name)}</p>
    <h1>Golf Carts for Sale</h1>
${answerBlock("What golf carts can you buy, and what do they cost?", esc(answer), snapshot.updatedAt.slice(0, 10))}
${statStrip(heroStats(snapshot))}
    <div class="hero__actions">
      <a class="btn btn--primary btn--lg" href="${esc(site.phoneTel)}">Call ${esc(site.phone)}</a>
      <a class="btn btn--outline btn--lg" href="${esc(withBase("/inventory/"))}">Browse the full inventory</a>
    </div>
  </div>
</div>

<section class="section">
  <div class="wrap wrap-narrow prose">
    <h2>What kinds of golf carts are there?</h2>
    <p>Six distinctions cover almost every buying decision, and each has its own page with live stock behind it.</p>
${comparisonTable(
    ["Type", "Built for", "In stock"],
    [
      ["New golf carts", "Daily use, full warranty, current battery technology", String(summary.new)],
      ["Used and pre-owned", "Occasional use and lower purchase price", String(summary.used)],
      ["Street legal / low speed vehicles", "Registered road use at 35 mph and below", String(summary.streetLegal)],
      ["Utility golf carts", "Hauling tools and material on a cargo bed", String(summary.utility)],
      ["Lifted and all-terrain", "Sand, wet grass, gravel and trail", String(summary.allTerrain)],
      ["Fleet golf carts", "Resorts, clubs, campgrounds, communities", "To order"],
    ],
    "Golf cart types and current stock",
  )}

    <h2>How do you choose between electric and gas?</h2>
    <p>Electric wins on running cost, noise, maintenance and where you are permitted to drive; ${summary.electric} of our ${summary.total} carts are electric. Gas wins on range, one-minute refuelling and sustained pulling on grades, which is why it still dominates on acreage and hunting land; we hold ${summary.gas}. If your community has noise rules, the decision is already made for you. The <a href="${esc(withBase("/guides/electric-vs-gas-golf-carts/"))}">electric versus gas comparison</a> sets both columns side by side.</p>

    <h2>Which battery should you buy?</h2>
    <p>On an electric cart this is the decision that matters most, because the pack is the most expensive component and the one that ages. ${summary.lithium} of our carts are lithium and ${summary.lead} lead-acid. Work through the arithmetic in the <a href="${esc(withBase("/guides/lithium-vs-lead-acid-golf-cart-batteries/"))}">lithium versus lead-acid guide</a> before you commit.</p>

    <h2>Can you drive a golf cart on the road?</h2>
    <p>Only if it is equipped and registered as a Low Speed Vehicle, and only on roads posted at 35 mph or below in states that permit it. We stock ${summary.streetLegal} carts already built to that specification; the <a href="${esc(withBase("/guides/street-legal-golf-carts-lsv-guide/"))}">street legal and LSV guide</a> covers the rules state by state for the areas we serve.</p>

    <h2>Where can you buy a golf cart near you?</h2>
    <p>We operate ${snapshot.stores.length} dealerships across ${states} states, and all of them draw on one shared inventory — so a cart listed at another location can usually be moved to yours. Find the nearest on the <a href="${esc(withBase("/locations/"))}">locations page</a>, or call ${esc(site.phone)} and we will search every lot while you are on the line.</p>
  </div>
</section>

${relatedLinks("Every golf cart category in stock", clusterLinks(snapshot))}

<section class="section section--surface">
  <div class="wrap">
    <div class="section-head"><h2>Golf carts for sale right now</h2></div>
    <div class="grid-carts">
${featured(snapshot, 8).map((cart, index) => cartCard(cart as never, index === 0)).join("\n")}
    </div>
    <p><a href="${esc(withBase("/inventory/"))}">See all ${summary.total} golf carts for sale</a></p>
  </div>
</section>

${relatedLinks(
    "Read before you buy",
    guides.map((guide) => ({ href: `/guides/${guide.slug}/`, label: guide.title })),
  )}
${faqSection(faqEntries, "Golf carts: questions and answers")}
${ctaBand()}`;

  return renderPage({
    path,
    title: clamp("Golf Carts for Sale — New, Used, Street Legal", 60),
    description: clamp(
      `${summary.total} golf carts for sale from ${formatPrice(summary.priceMin)}. New, used, pre-owned, street legal, utility and fleet carts across ${snapshot.stores.length} locations. 0% APR.`,
      155,
    ),
    body,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: path, label: "Golf Carts for Sale" },
    ],
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    head:
      `<meta name="keywords" content="${esc(keywords.primary.join(", "))}">` +
      `\n${preloadCartImage(featured(snapshot, 8)[0]?.images?.[0], "card")}`,
    nodes: [itemListNode(path, featured(snapshot, 8), summary.total), faqNode(path, faqEntries)],
  });
}
