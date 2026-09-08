/**
 * Listing route definitions (Phases 3.7 and 7).
 *
 * Each entry is a real, directly linkable URL with its own <h1>, title, meta
 * description, answer-first summary, body copy and FAQ — not a query-string
 * variant of one page. `locked` names the filters the route itself implies;
 * those are applied on top of whatever is in the query string and are omitted
 * from any URL the page writes, so a shopper cannot "uncheck" the page they
 * are on.
 *
 * `canonicalTo` marks an alias that resolves and is crawlable but folds its
 * ranking signal into a parent route, which is how near-duplicate combinations
 * are kept out of the index without 404ing a link someone already shared.
 */

import type { MultiField } from "../../src/lib/filters.ts";

export interface ListingRoute {
  path: string;
  /** Filters the route implies. */
  locked: Partial<Record<MultiField, string[]>>;
  h1: string;
  /** ≤60 chars. `{n}` is replaced with the live result count. */
  title: string;
  /** ≤155 chars. `{n}` is replaced with the live result count. */
  description: string;
  /** The question the page answers, for the answer-first block. */
  question: string;
  /** 40–60 words of plain prose. `{n}`, `{min}`, `{max}` are interpolated. */
  answer: string;
  /** Supporting body copy, question-shaped h2s. */
  copy: string;
  keywords: string[];
  /** FAQ topics to pull from src/config/faq.ts. */
  faqTopics: string[];
  /** An alias that canonicals into another route instead of ranking itself. */
  canonicalTo?: string;
  /** Keep out of the sitemap (aliases and thin combinations). */
  excludeFromSitemap?: boolean;
  /** Priority hint for the sitemap. */
  priority?: number;
}

/**
 * The primary listing routes.
 *
 * The ten phrases the brief names as ranking targets are distributed across
 * these routes and the pillar page, one owner each, and interlinked with
 * descriptive anchors rather than repeated exact-match text.
 */
export const LISTING_ROUTES: ListingRoute[] = [
  {
    path: "/inventory/",
    locked: {},
    h1: "Golf Carts for Sale",
    title: "Golf Carts for Sale — {n} in Stock | Memorial Day",
    description:
      "Browse all {n} golf carts in the Memorial Day Golf Cart Sales Event — new, used, electric, gas, lifted and street legal. 0% APR for 48 months.",
    question: "What golf carts are for sale right now?",
    answer:
      "We have {n} golf carts in stock across 15 locations, priced from {min} to {max}. That includes new and used carts, electric and gas models, street legal LSVs, lifted and all-terrain builds, and utility and fleet configurations. Every listing shows its price, battery age and the lot it sits on.",
    copy: `<h2>How many golf carts are in stock?</h2>
<p>{n} carts are on the floor today — {new} new and {used} used — spread across {stores} dealership locations in {states} states. The count and every price on this page come from our dealer management system, which the site re-reads every six hours, so what you see is what is physically on a lot.</p>
<h2>What does a golf cart cost?</h2>
<p>Current stock runs from {min} to {max}. A used lead-acid cart sits at the bottom of that range; a new lifted lithium model with a street-legal package sits at the top. At 0% APR for 48 months, a {max} cart is roughly {maxMonthly} a month and a {min} cart roughly {minMonthly}.</p>
<h2>How do I narrow this down?</h2>
<p>Use the filters to combine condition, power, brand, colour, passenger count, drivetrain, battery chemistry and location. Every filter is written into the URL, so a search can be bookmarked or sent to someone else and it will open showing exactly the same carts. If you already know the category you want, start from <a href="/inventory/new/">new golf carts</a>, <a href="/inventory/used/">used and pre-owned golf carts</a>, <a href="/inventory/street-legal/">street legal golf carts</a> or <a href="/inventory/utility/">utility golf carts</a>.</p>`,
    keywords: ["golf carts for sale", "golf cart", "golf cart vehicle marketplace", "golf cart inventory"],
    faqTopics: ["inventory", "pricing", "buying", "event"],
    priority: 0.9,
  },
  {
    path: "/inventory/new/",
    locked: { condition: ["new"] },
    h1: "New Golf Carts for Sale",
    title: "New Golf Carts for Sale — {n} in Stock",
    description:
      "{n} new golf carts with full factory warranty in the Memorial Day event. Current-generation lithium packs, event pricing and 0% APR for 48 months.",
    question: "What is included when you buy a new golf cart?",
    answer:
      "A new golf cart carries the full factory warranty, a current-generation battery pack and no service history to inspect. We have {n} new carts in stock from {min} to {max}. New stock also carries the deepest event discounts, because current model-year inventory is what a dealer most needs to clear.",
    copy: `<h2>How much does a new golf cart cost?</h2>
<p>New stock here runs {min} to {max}, and {lithium} of the {n} new carts use a lithium pack. The spread comes down to seats, lift and whether the cart is built to street-legal specification — a four-passenger electric with no lift sits near the bottom, a six-passenger lifted LSV near the top.</p>
<h2>Is a new golf cart worth it over a used one?</h2>
<p>If the cart will be driven most days, usually yes. A new lithium pack should give eight to ten years before it needs attention, where a four-year-old lead-acid pack on a used cart is a $900 to $1,800 replacement waiting to happen. If the cart will see occasional weekend use, a well-priced <a href="/inventory/used/">used golf cart</a> is the better value.</p>
<h2>What warranty comes with a new cart?</h2>
<p>Warranty runs by manufacturer, typically two to five years on the vehicle and separately on the battery pack. The warranty term we hold on file is printed on each listing. Read the <a href="/guides/golf-cart-buying-checklist/">golf cart buying checklist</a> before you commit to a configuration.</p>`,
    keywords: ["new golf carts", "new golf carts for sale", "brand new golf cart", "new golf cart prices"],
    faqTopics: ["buying", "pricing", "brands"],
    priority: 0.9,
  },
  {
    path: "/inventory/used/",
    locked: { condition: ["used"] },
    h1: "Used & Pre-Owned Golf Carts for Sale",
    title: "Used Golf Carts for Sale — {n} in Stock",
    description:
      "{n} reconditioned used and pre-owned golf carts. Battery year published on every listing, inspected before it reaches the floor, 0% APR available.",
    question: "What should you check on a used golf cart?",
    answer:
      "Battery age first. On a used electric cart the pack is the single biggest factor in value, so we publish the battery year and chemistry on every one of our {n} used and pre-owned listings. After that: tire wear, brake feel, and whether the cart holds speed on a hill after twenty minutes of running.",
    copy: `<h2>How old is the battery pack?</h2>
<p>Every used listing here shows the battery year and chemistry we hold on file. A lead-acid pack past four years should be priced as a near-term $900 to $1,800 replacement; a lithium pack of the same age has most of its service life ahead of it. Our <a href="/guides/lithium-vs-lead-acid-golf-cart-batteries/">lithium versus lead-acid comparison</a> explains how to read those numbers.</p>
<h2>What is the difference between used and pre-owned?</h2>
<p>Nothing, in practice — the trade is inconsistent about the words. Everything on this page is a cart that had a previous owner, was taken in on trade or at auction, and was inspected and reconditioned before it reached the floor. We use "used" and "pre-owned" interchangeably and price to condition, not to the label.</p>
<h2>What does a used golf cart cost?</h2>
<p>Used stock runs {min} to {max}, against {n} carts on the floor. The cheapest are older gas and lead-acid electric carts; the dearest are two- and three-year-old lifted lithium models that are still under some of their original warranty.</p>
<h2>What to watch for on a test drive</h2>
<p>Drive it up the steepest grade on the lot, twice. A cart that slows on the second pass is showing voltage sag, which points to a tired pack no matter what the year on the label says. Check that the charger is the one that came with the cart, and that all four tires match.</p>`,
    keywords: ["used golf carts", "pre owned golf carts", "used golf carts for sale", "second hand golf carts"],
    faqTopics: ["buying", "batteries", "pricing"],
    priority: 0.9,
  },
  {
    path: "/inventory/street-legal/",
    locked: { feature: ["street-legal"] },
    h1: "Street Legal Golf Carts & Low Speed Vehicles",
    title: "Street Legal Golf Carts & LSVs — {n} in Stock",
    description:
      "{n} street legal golf carts and low speed vehicles with lights, mirrors, seat belts, windshield and a VIN — ready to title and register. 0% APR available.",
    question: "What makes a golf cart street legal?",
    answer:
      "A street legal cart is a Low Speed Vehicle under Federal Motor Vehicle Safety Standard 500. It must reach 20 to 25 mph and carry headlights, tail and brake lights, turn signals, reflectors, two mirrors, a parking brake, a DOT windshield, seat belts at every seat, and a VIN. We stock {n}.",
    copy: `<h2>What equipment does an LSV need?</h2>
<p>FMVSS 500 sets the list: a top speed between 20 and 25 mph, headlights, tail and brake lights, front and rear turn signals, reflex reflectors, a driver-side mirror plus an interior or passenger-side mirror, a parking brake, a windshield to federal standard, a seat belt at every seating position, and a VIN. A cart missing any one of those is not an LSV, whatever the seller calls it.</p>
<h2>Are low speed golf carts legal on the road?</h2>
<p>On roads posted at 35 mph or below, in most states, once the cart is titled, registered and insured as an LSV. Above that, generally not. The rules are set state by state and often narrowed again by the municipality, so confirm with your own DMV before you buy — our <a href="/guides/street-legal-golf-carts-lsv-guide/">street legal and LSV guide</a> covers the states we serve.</p>
<h2>Can an existing cart be made street legal?</h2>
<p>Usually. A cart that can hit 20 mph can be brought up to LSV specification with a lighting, mirror, belt and windshield package, and then submitted for a VIN. Carts that cannot reach 20 mph cannot become LSVs at any price. Call us with the model and we will tell you which side of that line it falls on.</p>`,
    keywords: ["street legal golf carts", "low speed golf carts", "LSV for sale", "low speed vehicle", "road legal golf cart"],
    faqTopics: ["street-legal", "buying", "delivery"],
    priority: 0.9,
  },
  {
    path: "/inventory/utility/",
    locked: { passengers: ["utility"] },
    h1: "Utility Golf Carts for Sale",
    title: "Utility Golf Carts for Sale — {n} in Stock",
    description:
      "{n} utility golf {carts} with cargo beds for grounds, farm, warehouse and campground work. Haul tools and material, not passengers. 0% APR for 48 months.",
    question: "What is a utility golf cart?",
    answer:
      "A utility golf cart trades rear seating for a cargo bed. It is built to haul tools, feed, turf material or luggage rather than people, and is what grounds crews, farms, warehouses, campgrounds and maintenance departments buy. We have {n} in stock, priced from {min}.",
    copy: `<h2>What can a utility cart carry?</h2>
<p>Bed capacity on the models we stock runs roughly 400 to 1,200 lb, with towing on top of that where a hitch is fitted. The limit in practice is rarely the bed — it is the drivetrain on a grade and the pack capacity over a full shift, which is why utility buyers should size the battery to the shift, not to the mileage.</p>
<h2>Utility cart or a full UTV?</h2>
<p>A utility golf cart is quieter, cheaper to run, easier to license on private property and far cheaper to maintain. A UTV wins on ground clearance, payload and rough terrain. For turf, paved paths, warehouses and campgrounds, the cart is the right tool; for genuinely broken ground, it is not.</p>
<h2>Buying more than one</h2>
<p>Most utility carts here go out in twos and threes. If you are equipping a crew, see <a href="/inventory/fleet/">fleet golf carts</a> for multi-unit pricing and commercial financing, or call and we will quote the whole order at once.</p>`,
    keywords: ["utility golf carts", "utility golf cart for sale", "cargo golf cart", "work golf cart"],
    faqTopics: ["buying", "pricing", "delivery"],
    priority: 0.9,
  },
  {
    path: "/inventory/fleet/",
    locked: { passengers: ["utility", "6-passenger"] },
    h1: "Fleet Golf Carts for Resorts, Clubs & Communities",
    title: "Fleet Golf Carts for Sale — {n} in Stock",
    description:
      "{n} fleet-suitable golf carts — six-passenger transport and utility cargo models for resorts, golf clubs, campgrounds and communities. Commercial financing available.",
    question: "What is a fleet golf cart?",
    answer:
      "A fleet golf cart is bought in quantity and run hard: resort transport, course rental, campground shuttles, community security. That means six-passenger people-movers and utility cargo models, specified for uptime rather than features. We have {n} fleet-suitable carts in stock and can source matched multiples.",
    copy: `<h2>How do you specify a fleet?</h2>
<p>Three things decide it. Duty cycle — how many hours per day, which sets battery chemistry. Terrain — grades and surface, which sets motor and tires. Uptime tolerance — how many spares you need on the shelf. Lithium costs more per cart and almost always wins on a two-shift duty cycle because it charges in three to five hours and takes partial charges without damage.</p>
<h2>Can you match units across an order?</h2>
<p>Usually yes. Carts in stock here are singles from {stores} locations, so a matched fleet is normally sourced to order — we do that weekly. Tell us the count, the seat configuration and the delivery date and we will quote against current allocation.</p>
<h2>Fleet financing</h2>
<p>Commercial and municipal buyers generally go through Univest Capital or DLL Financial rather than the retail 0% programme; both handle multi-unit and lease structures. See <a href="/financing/">golf cart financing</a> for the lender list, or call and ask for commercial.</p>`,
    keywords: ["fleet golf carts", "golf cart fleet", "commercial golf carts", "resort golf carts"],
    faqTopics: ["financing", "delivery", "buying"],
    priority: 0.8,
  },
  {
    path: "/inventory/electric/",
    locked: { fuel: ["electric"] },
    h1: "Electric Golf Carts for Sale",
    title: "Electric Golf Carts for Sale — {n} in Stock",
    description:
      "{n} electric golf carts including {lithium} lithium models. Quiet, cheap to run, no engine service. Memorial Day pricing and 0% APR for 48 months.",
    question: "How far does an electric golf cart go on a charge?",
    answer:
      "A lead-acid electric cart covers 25 to 40 miles per charge; a lithium cart covers 45 to 60 and holds full speed to the end of it. A full charge costs roughly 50 cents to $1.50. We have {n} electric carts in stock, {lithium} of them lithium.",
    copy: `<h2>What does it cost to run?</h2>
<p>Around 50 cents to $1.50 for a full charge, depending on your electricity rate and pack size. There is no fuel to store, no oil to change and no engine to service — brakes, tires and the charger are the only wear items on a lithium cart.</p>
<h2>Is lithium worth the premium?</h2>
<p>For regular use, yes: 3,000 to 5,000 cycles against 500 to 1,000 for lead-acid, roughly half the weight, no watering, no terminal cleaning, and the cart does not slow as the pack drains. For a cart used a few weekends a year, lead-acid at a lower purchase price is the rational choice. The <a href="/guides/lithium-vs-lead-acid-golf-cart-batteries/">battery comparison guide</a> works through the arithmetic.</p>
<h2>Where can you drive an electric cart?</h2>
<p>Almost anywhere a cart is allowed. Many golf communities, campgrounds and beach towns restrict gas carts on noise grounds but permit electric, so electric is the safer choice when local rules are unclear. Compare against <a href="/inventory/gas/">gas golf carts</a> if you have acreage or no charging point.</p>`,
    keywords: ["electric golf carts for sale", "lithium golf cart", "battery golf cart", "48v golf cart"],
    faqTopics: ["batteries", "buying", "pricing"],
    priority: 0.8,
  },
  {
    path: "/inventory/gas/",
    locked: { fuel: ["gas"] },
    h1: "Gas Golf Carts for Sale",
    title: "Gas Golf Carts for Sale — {n} in Stock",
    description:
      "{n} gas golf carts for acreage, hunting, hills and all-day running with nowhere to charge. Refuel in a minute, no battery pack to replace. 0% APR available.",
    question: "When is a gas golf cart the right choice?",
    answer:
      "When the cart runs all day with no chance to charge, when the ground is steep, or when the property is large. A gas cart refuels in a minute, covers 30 to 40 miles per gallon and has no pack to replace. We have {n} in stock.",
    copy: `<h2>Gas or electric?</h2>
<p>Gas wins on range, refuelling speed and sustained pulling on grades — the reasons it dominates on farms, hunting leases and large acreage. Electric wins on running cost, noise, maintenance and where you are allowed to drive. Our <a href="/guides/electric-vs-gas-golf-carts/">electric versus gas comparison</a> lays out both columns.</p>
<h2>Where are gas carts not allowed?</h2>
<p>Many golf communities, gated neighbourhoods, campgrounds and beach municipalities restrict or ban gas carts on noise and emissions grounds. Check your HOA or town ordinance before you buy — if the cart will live somewhere with rules, look at <a href="/inventory/electric/">electric golf carts</a> instead.</p>
<h2>What maintenance does a gas cart need?</h2>
<p>Oil changes, air and fuel filters, spark plugs, belts and carburettor service, plus fuel stabiliser before winter storage. It is ordinary small-engine work, and it is genuinely more than an electric cart asks for.</p>`,
    keywords: ["gas golf carts for sale", "gas powered golf cart", "EFI golf cart"],
    faqTopics: ["buying", "pricing"],
    priority: 0.7,
  },
  {
    path: "/inventory/lifted/",
    locked: { feature: ["lifted"] },
    h1: "Lifted Golf Carts for Sale",
    title: "Lifted Golf Carts for Sale — {n} in Stock",
    description:
      "{n} lifted golf carts riding 3 to 6 inches higher on 12 to 14 inch all-terrain tires. Built for sand, wet grass and gravel. 0% APR for 48 months.",
    question: "What does lifting a golf cart do?",
    answer:
      "A lift kit raises the cart three to six inches and clears 12 to 14 inch wheels with all-terrain tires. That ground clearance is what lets a cart cross soft sand, wet grass and gravel without dragging, and it noticeably smooths the ride over uneven ground. We stock {n}.",
    copy: `<h2>How much lift do you need?</h2>
<p>Three inches clears 12 inch wheels and handles most grass, gravel and packed sand. Five to six inches clears 14 inch wheels and is what soft beach sand and rutted tracks actually require. Past six inches you are buying appearance, and paying for it in step-in height and stability.</p>
<h2>What are the trade-offs?</h2>
<p>A higher step-in, a marginally higher centre of gravity, and a small range penalty from turning larger, heavier tires. On an electric cart expect to give up five to ten percent of your range. Our <a href="/guides/golf-cart-tires-and-suspension/">tire and suspension guide</a> covers matching tire size to lift.</p>
<h2>Lifted and street legal together</h2>
<p>The two are compatible — a lifted cart can still be built to LSV specification, and many here are. See <a href="/inventory/street-legal/">street legal golf carts</a>, or <a href="/inventory/4x4/">4x4 golf carts</a> if you want driven rear and front axles as well as the clearance.</p>`,
    keywords: ["lifted golf carts", "lifted golf cart for sale", "off road golf cart", "all terrain golf cart"],
    faqTopics: ["buying", "pricing"],
    priority: 0.8,
  },
  {
    path: "/inventory/4x4/",
    locked: { drivetrain: ["4x4"] },
    h1: "4x4 Golf Carts for Sale",
    title: "4x4 Golf Carts for Sale — {n} in Stock",
    description:
      "{n} four-wheel-drive golf {carts} for soft sand, mud and steep ground. Power to all four wheels where a 2x4 cart loses traction. Call for current stock.",
    question: "Do you need a 4x4 golf cart?",
    answer:
      "Only if you regularly cross soft sand, mud or steep wet ground. Four-wheel drive sends power to all four wheels, so the cart keeps moving where a 2x4 spins. For paved paths, turf and packed gravel a lifted 2x4 on all-terrain tires is enough, and cheaper. We hold {n} in stock.",
    copy: `<h2>4x4 or lifted 2x4?</h2>
<p>Lift solves clearance; four-wheel drive solves traction. They are different problems. If the cart drags its frame, you want a <a href="/inventory/lifted/">lifted cart</a>. If the cart has clearance but the wheels spin, you want 4x4. Soft dune sand and clay mud after rain are the two cases that genuinely need the second.</p>
<h2>What does 4x4 cost you?</h2>
<p>More up front, more weight, more drivetrain to service, and range. On an electric cart, four-wheel drive plus all-terrain tires can take fifteen percent off a charge. That is a fair trade if you need it and a poor one if you do not.</p>
<h2>Stock is thin by design</h2>
<p>Four-wheel-drive carts are a small share of what any dealer floors, and this page reflects real stock rather than a catalogue. If it shows one or none, call {phone} — we source these to order regularly and can usually find a configuration inside a fortnight. Meanwhile <a href="/inventory/all-terrain/">all-terrain golf carts</a> covers the wider off-road selection.</p>`,
    keywords: ["4x4 golf carts", "four wheel drive golf cart", "off-road golf carts"],
    faqTopics: ["buying", "inventory"],
    priority: 0.7,
  },
  {
    path: "/inventory/all-terrain/",
    locked: { tire: ["all-terrain"] },
    h1: "All-Terrain & Off-Road Golf Carts",
    title: "All-Terrain Golf Carts — {n} in Stock",
    description:
      "{n} off-road golf carts on all-terrain tires for beach, farm and trail use. Aggressive tread, higher clearance and suspension built for rough ground.",
    question: "What is an all-terrain golf cart?",
    answer:
      "An all-terrain golf cart runs knobby off-road tires instead of smooth turf tires, almost always with a lift and firmer suspension. The tread digs into sand, mud and loose gravel where a turf tire skates. We have {n} carts on all-terrain rubber in stock.",
    copy: `<h2>All-terrain tires versus turf tires</h2>
<p>Turf tires have a shallow, wide pattern designed not to mark a fairway. All-terrain tires have deep, open lugs that bite into loose ground. On grass and pavement the turf tire is quieter, smoother and gives more range; on sand and mud it is close to useless. Pick for the worst surface the cart will see, not the average one.</p>
<h2>Do all-terrain tires need a lift?</h2>
<p>Almost always. A 12 or 14 inch all-terrain tire will not clear an unlifted cart's body under suspension travel, so the two go together — which is why nearly every cart on this page is also on the <a href="/inventory/lifted/">lifted golf carts</a> list. Our <a href="/guides/golf-cart-tires-and-suspension/">tire and suspension guide</a> gives the size-to-lift table.</p>
<h2>What does off-road use cost in range?</h2>
<p>Five to fifteen percent, from the extra rolling resistance and rotating weight. On soft sand, considerably more — sand is the hardest surface there is on a golf cart pack. Size the battery for the terrain, not the mileage on the spec sheet.</p>`,
    keywords: ["off-road golf carts", "all terrain golf carts", "street legal all terrain carts", "beach golf cart"],
    faqTopics: ["buying", "batteries"],
    priority: 0.8,
  },
  {
    path: "/inventory/lithium/",
    locked: { battery: ["lithium"] },
    h1: "Lithium Golf Carts for Sale",
    title: "Lithium Golf Carts for Sale — {n} in Stock",
    description:
      "{n} lithium golf carts — 45 to 60 miles per charge, 3,000+ cycles, no watering and full speed to the end of the charge. 0% APR for 48 months.",
    question: "Why buy a lithium golf cart?",
    answer:
      "Range, lifespan and no maintenance. A lithium pack gives 45 to 60 miles per charge against 25 to 40 for lead-acid, lasts 3,000 to 5,000 cycles against 500 to 1,000, weighs about half as much, needs no watering, and holds full speed until it is nearly empty. We stock {n}.",
    copy: `<h2>How long does a lithium pack last?</h2>
<p>Three to five thousand charge cycles, which for most private owners is eight to ten years of ordinary use. Lead-acid gives five hundred to a thousand, or four to six years. On a cart you intend to keep, the lithium premium is usually recovered once over the life of the vehicle.</p>
<h2>Can you charge it partially?</h2>
<p>Yes, and that is a real advantage. Lithium takes partial charges without damage, so plugging in for an hour between trips costs it nothing. Lead-acid is degraded by exactly that habit and wants a full charge cycle every time.</p>
<h2>What about cold weather?</h2>
<p>Lithium loses some usable capacity below freezing and most packs will not accept a charge at all below about 0 °C without an internal heater. If the cart winters in an unheated barn in the north, that matters; if it lives in Florida, it does not. Compare the chemistries in the <a href="/guides/lithium-vs-lead-acid-golf-cart-batteries/">lithium versus lead-acid guide</a>.</p>`,
    keywords: ["lithium golf cart", "lithium golf carts for sale", "lifepo4 golf cart"],
    faqTopics: ["batteries", "buying"],
    priority: 0.7,
  },
  {
    path: "/inventory/4-passenger/",
    locked: { passengers: ["4-passenger"] },
    h1: "4 Passenger Golf Carts for Sale",
    title: "4 Passenger Golf Carts — {n} in Stock",
    description:
      "{n} four-passenger golf carts — the standard family and neighbourhood configuration, with a rear-facing seat that folds to a cargo deck. 0% APR available.",
    question: "How many people fit in a 4 passenger golf cart?",
    answer:
      "Four adults, in two rows. Most four-passenger carts use a rear-facing bench that folds flat into a cargo deck, so the same cart carries two people and their shopping or four people to dinner. It is the most common configuration we sell — {n} in stock.",
    copy: `<h2>Is a four-passenger cart big enough?</h2>
<p>For most households, yes. Four seats with a folding rear bench covers school runs, beach trips and errands without the extra length of a six-seater, which matters on narrow paths and in a standard garage. If you routinely carry five or more, go to <a href="/inventory/6-passenger/">six passenger golf carts</a>.</p>
<h2>What does the rear seat do?</h2>
<p>On most models it flips: a rear-facing bench for passengers, folded down to a flat cargo deck for luggage or coolers. Check the seat belt provision if the cart is street legal — an LSV needs a belt at every seating position, including the rear-facing ones.</p>`,
    keywords: ["4 passenger golf carts", "four seater golf cart", "family golf cart"],
    faqTopics: ["buying", "pricing"],
    priority: 0.6,
  },
  {
    path: "/inventory/6-passenger/",
    locked: { passengers: ["6-passenger"] },
    h1: "6 Passenger Golf Carts for Sale",
    title: "6 Passenger Golf Carts — {n} in Stock",
    description:
      "{n} six-passenger golf carts for large families, resort transport and community shuttles. Longer wheelbase, more battery, smoother ride. 0% APR available.",
    question: "Who needs a 6 passenger golf cart?",
    answer:
      "Large households, rental properties, resorts and anyone who regularly moves more than four people. The longer wheelbase rides better and usually carries a bigger pack, but it needs more room to turn and to park. We have {n} in stock.",
    copy: `<h2>What changes on a six-seater?</h2>
<p>Wheelbase, weight and pack size all go up. The ride improves noticeably over rough ground, and the extra battery usually offsets the extra weight so range holds up. Turning circle and garage fit are the two things people underestimate — measure before you buy.</p>
<h2>Six-passenger for a rental or resort</h2>
<p>Six-seaters are the backbone of resort and campground transport, which is why they appear on our <a href="/inventory/fleet/">fleet golf carts</a> page too. For multi-unit orders, ask for commercial pricing rather than the retail event price.</p>`,
    keywords: ["6 passenger golf carts", "six seater golf cart", "limo golf cart"],
    faqTopics: ["buying", "delivery"],
    priority: 0.6,
  },
  {
    path: "/inventory/2-passenger/",
    locked: { passengers: ["2-passenger"] },
    h1: "2 Passenger Golf Carts for Sale",
    title: "2 Passenger Golf Carts — {n} in Stock",
    description:
      "{n} two-passenger golf carts — the compact, lightest and cheapest configuration, ideal for a single golfer, a couple or tight storage. 0% APR available.",
    question: "Is a 2 passenger golf cart enough?",
    answer:
      "For one or two people it is the better buy: lighter, cheaper, longer range from the same pack, and it fits in a standard garage alongside a car. The compromise is obvious — no rear seat and limited cargo space. We have {n} in stock from {min}.",
    copy: `<h2>Why choose two seats?</h2>
<p>Weight. A two-passenger cart asks less of its pack, so the same battery goes further and lasts longer, and the cart is easier to tow and to store. On price it is consistently the cheapest way into a good cart.</p>
<h2>What do you give up?</h2>
<p>Passenger capacity and deck space. If a fourth person shows up twice a year you will manage; if it is twice a week, buy a <a href="/inventory/4-passenger/">four passenger cart</a> instead.</p>`,
    keywords: ["2 passenger golf carts", "two seater golf cart", "compact golf cart"],
    faqTopics: ["buying", "pricing"],
    priority: 0.6,
  },
];

/**
 * Aliases that resolve and are crawlable but fold into a parent route.
 *
 * These exist because the phrases are ones people type and link, and a live
 * URL that canonicals correctly beats a 404. They carry a canonical to the
 * parent and stay out of the sitemap.
 */
export const LISTING_ALIASES: ListingRoute[] = [
  {
    ...LISTING_ROUTES.find((route) => route.path === "/inventory/used/")!,
    path: "/inventory/pre-owned/",
    h1: "Pre-Owned Golf Carts for Sale",
    title: "Pre-Owned Golf Carts for Sale — {n} in Stock",
    canonicalTo: "/inventory/used/",
    excludeFromSitemap: true,
  },
  {
    ...LISTING_ROUTES.find((route) => route.path === "/inventory/street-legal/")!,
    path: "/inventory/low-speed-vehicles/",
    h1: "Low Speed Vehicles (LSV) for Sale",
    title: "Low Speed Vehicles for Sale — {n} in Stock",
    canonicalTo: "/inventory/street-legal/",
    excludeFromSitemap: true,
  },
  {
    ...LISTING_ROUTES.find((route) => route.path === "/inventory/all-terrain/")!,
    path: "/inventory/off-road/",
    h1: "Off-Road Golf Carts for Sale",
    title: "Off-Road Golf Carts for Sale — {n} in Stock",
    canonicalTo: "/inventory/all-terrain/",
    excludeFromSitemap: true,
  },
];

export const ALL_LISTING_ROUTES = [...LISTING_ROUTES, ...LISTING_ALIASES];
