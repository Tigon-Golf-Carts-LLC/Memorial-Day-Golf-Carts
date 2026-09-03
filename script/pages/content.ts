/**
 * Content pages: financing, about, contact, service, trade-in, delivery, FAQ,
 * guides, legal, the HTML sitemap and the 404 body.
 *
 * Phase 8 — forms. There is no server, so every form on this site posts to
 * Formspree. `FORMSPREE_FORM_ID` is read from the environment at build time;
 * when it is unset the markup degrades to a mailto: link rather than shipping a
 * form that silently discards submissions. Every form page also carries the
 * phone number as the primary CTA.
 */

import { site, salesEvent, financingPartners, keywords } from "../../src/config/site.ts";
import { esc, withBase, formatPrice, monthlyPayment, clamp, isoDate } from "../lib/util.ts";
import { renderPage } from "../lib/layout.ts";
import {
  ctaBand, faqSection, answerBlock, specTable, comparisonTable, relatedLinks, statStrip,
} from "../lib/components.ts";
import { faqNode, articleNode, type Crumb } from "../lib/schema.ts";
import { pickFaq, type Snapshot } from "./inventory.ts";
import { faq } from "../../src/config/faq.ts";
import { guides } from "../../src/config/guides.ts";
import { testimonials } from "../../src/config/testimonials.ts";
import { LISTING_ROUTES } from "../lib/routes.ts";
import { brandSlug } from "./brands.ts";

/**
 * The Formspree form ID, injected at build time.
 * Unset means: render a mailto: link instead of a dead form.
 */
const FORMSPREE_FORM_ID = process.env.FORMSPREE_FORM_ID || "";
const FORMSPREE_ACTION = FORMSPREE_FORM_ID ? `https://formspree.io/f/${FORMSPREE_FORM_ID}` : "";

/**
 * A lead form.
 *
 * Posts to Formspree when a form ID is configured. With no ID, the same fields
 * are replaced by a mailto: link and a visible note, so nothing pretends to
 * accept a submission it cannot deliver.
 */
function leadForm(options: {
  id: string;
  subject: string;
  heading: string;
  fields?: Array<{ name: string; label: string; type?: string; required?: boolean; placeholder?: string }>;
}): string {
  const fields = options.fields ?? [
    { name: "name", label: "Your name", required: true },
    { name: "phone", label: "Phone", type: "tel", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "message", label: "What are you looking for?", type: "textarea" },
  ];

  if (!FORMSPREE_ACTION) {
    return `<div class="form-fallback" data-testid="form-fallback-${esc(options.id)}">
  <h3>${esc(options.heading)}</h3>
  <p>The quickest route is the phone — someone answers it ${esc(site.hoursSummary.toLowerCase())}</p>
  <p>
    <a class="btn btn--primary btn--lg" href="${esc(site.phoneTel)}">Call ${esc(site.phone)}</a>
    <a class="btn btn--outline btn--lg" href="mailto:${esc(site.email)}?subject=${esc(options.subject)}">Email ${esc(site.email)}</a>
  </p>
  <p class="note">Email reaches a product specialist and is answered the same day during event hours.</p>
</div>`;
  }

  return `<form class="lead-form" action="${esc(FORMSPREE_ACTION)}" method="POST" data-testid="form-${esc(options.id)}">
  <h3>${esc(options.heading)}</h3>
  <input type="hidden" name="_subject" value="${esc(options.subject)}">
  <input type="hidden" name="_source" value="${esc(site.domain)}">
  <p class="visually-hidden">
    <label>Leave this field empty<input type="text" name="_gotcha" tabindex="-1" autocomplete="off"></label>
  </p>
${fields
  .map((field) => {
    const id = `${options.id}-${field.name}`;
    if (field.type === "textarea") {
      return `  <label class="lead-form__field" for="${esc(id)}">
    <span>${esc(field.label)}</span>
    <textarea id="${esc(id)}" name="${esc(field.name)}" rows="4"${field.required ? " required" : ""}${field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : ""}></textarea>
  </label>`;
    }
    return `  <label class="lead-form__field" for="${esc(id)}">
    <span>${esc(field.label)}</span>
    <input id="${esc(id)}" type="${esc(field.type ?? "text")}" name="${esc(field.name)}"${field.required ? " required" : ""}${field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : ""} autocomplete="${field.type === "tel" ? "tel" : field.type === "email" ? "email" : "on"}">
  </label>`;
  })
  .join("\n")}
  <button class="btn btn--primary btn--lg" type="submit">Send</button>
  <p class="note">Or call <a href="${esc(site.phoneTel)}">${esc(site.phone)}</a> — ${esc(site.hoursSummary.toLowerCase())}</p>
</form>`;
}

/** Shared shell for a narrow prose page. */
function simplePage(options: {
  snapshot: Snapshot;
  path: string;
  title: string;
  h1: string;
  description: string;
  question: string;
  answer: string;
  body: string;
  crumbLabel: string;
  faqEntries?: Array<{ q: string; a: string }>;
  nodes?: unknown[];
  keywords?: string[];
  related?: Array<{ href: string; label: string }>;
  relatedHeading?: string;
  noindex?: boolean;
}): string {
  const faqEntries = options.faqEntries ?? [];
  const body = `<div class="page-head">
  <div class="wrap wrap-narrow">
    <h1>${esc(options.h1)}</h1>
${answerBlock(options.question, options.answer, options.snapshot.updatedAt.slice(0, 10))}
  </div>
</div>

<section class="section">
  <div class="wrap wrap-narrow prose">
${options.body}
  </div>
</section>

${options.related?.length ? relatedLinks(options.relatedHeading ?? "Related", options.related) : ""}
${faqSection(faqEntries)}
${ctaBand()}`;

  return renderPage({
    path: options.path,
    title: clamp(options.title, 60),
    description: clamp(options.description, 155),
    body,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: options.path, label: options.crumbLabel },
    ],
    stores: options.snapshot.stores,
    modifiedAt: options.snapshot.updatedAt,
    noindex: options.noindex,
    head: options.keywords?.length ? `<meta name="keywords" content="${esc(options.keywords.join(", "))}">` : "",
    nodes: [...(options.nodes ?? []), ...(faqEntries.length ? [faqNode(options.path, faqEntries)] : [])],
  });
}

/* ------------------------------------------------------------- financing --- */

export function renderFinancingPage(snapshot: Snapshot): string {
  const summary = snapshot.summary as Record<string, number>;
  const path = "/financing/";
  const faqEntries = pickFaq(["financing", "pricing"], 6);

  const rows: string[][] = [2500, 5000, 7500, 10000, 12500, 15000].map((price) => [
    formatPrice(price),
    `$${Math.round(price / 48).toLocaleString("en-US")}`,
    `$${Math.round(price / 36).toLocaleString("en-US")}`,
    `$${Math.round(price / 24).toLocaleString("en-US")}`,
  ]);

  return simplePage({
    snapshot,
    path,
    title: "Golf Cart Financing — 0% APR for 48 Months",
    h1: "Golf Cart Financing",
    description: `0% APR for 48 months on approved credit during the ${salesEvent.name}. Six lenders, soft-pull prequalification, commercial and fleet options. Call ${site.phone}.`,
    question: "How does golf cart financing work?",
    answer: `Approved buyers get 0% APR for 48 months during the ${salesEvent.name}, so the monthly payment is simply the price divided by 48 with no interest added. We work with six lenders, several of which prequalify on a soft pull that does not affect your credit score.`,
    crumbLabel: "Financing",
    keywords: ["golf cart financing", "0% APR golf cart", "golf cart payments", "golf cart loan"],
    body: `<h2>What does a golf cart cost per month?</h2>
    <p>At 0% APR the arithmetic is straightforward — price divided by term. Our current stock runs ${formatPrice(summary.priceMin)} to ${formatPrice(summary.priceMax)}, which is ${Math.round(monthlyPayment(summary.priceMin)!)} to ${Math.round(monthlyPayment(summary.priceMax)!)} dollars a month over 48 months.</p>
${comparisonTable(["Cart price", "48 months", "36 months", "24 months"], rows, "Monthly payment at 0% APR by term")}
    <p class="note">Estimates at 0% APR on approved credit. Tax, title, registration and delivery are not included. Your actual rate and term depend on the lender's decision.</p>

    <h2>What do you need to prequalify?</h2>
    <ul>
      <li>Your legal name, address and date of birth.</li>
      <li>Employment and gross annual income.</li>
      <li>A rough idea of the cart price — the listing page price is fine.</li>
    </ul>
    <p>Several of the lenders below run a soft pull for prequalification, which does not affect your score. A hard pull happens only when you accept an offer.</p>

    <h2>Can a business or municipality finance a fleet?</h2>
    <p>Yes. Univest Capital and DLL Financial handle commercial and municipal structures including leases and multi-unit orders, which the retail 0% programme does not cover. If you are buying more than two carts, see <a href="${esc(withBase("/inventory/fleet/"))}">fleet golf carts</a> and ask for commercial when you call.</p>

    <h2>Our financing partners</h2>
    <div class="partner-grid">
${financingPartners
  .map(
    (partner) => `      <article class="partner-card">
        <h3>${esc(partner.name)}</h3>
        <p>${esc(partner.blurb)}</p>
        <p><a class="btn btn--outline btn--sm" href="${esc(partner.url)}" rel="noopener noreferrer nofollow" target="_blank">Apply with ${esc(partner.name)}</a></p>
      </article>`,
  )
  .join("\n")}
    </div>
    <p>Applications are submitted directly to each lender on their own site — we never handle your credit information on this one. If you would rather not fill anything in, call ${esc(site.phone)} and a specialist will walk the options with you.</p>

    <h2>Does a trade-in change the financing?</h2>
    <p>It reduces the amount financed, which reduces the payment. Trade value stacks on top of event pricing rather than replacing it — see <a href="${esc(withBase("/trade-in/"))}">trading in your golf cart</a>.</p>`,
    related: [
      { href: "/inventory/", label: `All ${summary.total} golf carts for sale` },
      { href: "/inventory/new/", label: "New golf carts with full warranty" },
      { href: "/inventory/used/", label: "Used and pre-owned golf carts" },
      { href: "/trade-in/", label: "Trade in your current golf cart" },
      { href: "/guides/golf-cart-buying-checklist/", label: "The golf cart buying checklist" },
    ],
    relatedHeading: "Next steps",
    faqEntries,
  });
}

/* ----------------------------------------------------------------- about --- */

export function renderAboutPage(snapshot: Snapshot): string {
  const summary = snapshot.summary as Record<string, number>;
  const states = new Set(snapshot.stores.map((store) => store.state)).size;
  return simplePage({
    snapshot,
    path: "/about/",
    title: `About ${site.name}`,
    h1: `About ${site.name}`,
    description: `${site.name} runs the ${salesEvent.name} across ${snapshot.stores.length} dealership locations in ${states} states, with ${summary.total} carts in one shared inventory.`,
    question: "Who are Memorial Day Golf Carts?",
    answer: `${site.name} is the Memorial Day sales-event arm of ${site.legalName}, a golf cart dealer group running ${snapshot.stores.length} locations across ${states} states. Between them the stores carry ${summary.total} carts — new, used, electric, gas, street legal, lifted and utility — on one shared inventory.`,
    crumbLabel: "About",
    body: `<h2>How we work</h2>
    <p>Every cart on this site is read from the dealer management system our stores run day to day. Nothing here is a catalogue entry or a stock photograph of a model we could order: if it is listed, it is a specific cart standing on a specific lot, and the photographs are of that cart. The site re-reads the system every six hours, so a cart that sells drops off within hours rather than at the end of the month.</p>
    <p>We publish the things dealers usually leave out — the battery year and chemistry on used carts, the VIN where one exists, the odometer, the exact lot a cart is on. A shopper who knows the pack is four years old can price a replacement into their offer, which is a better conversation than discovering it later.</p>

    <h2>What we sell</h2>
    <ul>
      <li><strong>${summary.new} new golf carts</strong> under full factory warranty.</li>
      <li><strong>${summary.used} used and pre-owned carts</strong>, inspected and reconditioned before they reach a floor.</li>
      <li><strong>${summary.streetLegal} street legal carts</strong> built to Low Speed Vehicle specification.</li>
      <li><strong>${summary.utility} utility carts</strong> with cargo beds, plus fleet configurations to order.</li>
      <li>Service, parts and LSV upfits on carts we did not sell you.</li>
    </ul>

    <h2>What customers say</h2>
${testimonials
  .slice(0, 4)
  .map(
    (entry) => `    <blockquote class="testimonial">
      <p>${esc(entry.body)}</p>
      <footer>${esc(entry.name)}, ${esc(entry.city)} ${esc(entry.stateCode)} &middot; ${entry.rating}/5 &middot; ${esc(entry.cart)}</footer>
    </blockquote>`,
  )
  .join("\n")}

    <h2>Contact</h2>
${specTable(
      [
        ["Name", site.legalName],
        ["Phone", site.phone],
        ["Email", site.email],
        ["Hours", site.hoursSummary],
        ["Locations", `${snapshot.stores.length} across ${states} states`],
        ["Event", `${salesEvent.name}, May 15 – June 2`],
      ],
      `${site.name} business details`,
    )}`,
    related: [
      { href: "/locations/", label: `All ${snapshot.stores.length} dealership locations` },
      { href: "/contact/", label: "Contact a product specialist" },
      { href: "/service/", label: "Service, parts and LSV upfits" },
      { href: "/golf-carts-for-sale/", label: "Every golf cart for sale" },
    ],
    faqEntries: pickFaq(["contact", "event"], 4),
  });
}

/* --------------------------------------------------------------- contact --- */

export function renderContactPage(snapshot: Snapshot): string {
  const path = "/contact/";
  const faqEntries = pickFaq(["contact", "delivery", "event"], 5);

  const body = `<div class="page-head">
  <div class="wrap wrap-narrow">
    <h1>Contact ${esc(site.name)}</h1>
${answerBlock(
    "How do you get in touch?",
    esc(
      `Call ${site.phone} — it is answered ${site.hoursSummary.toLowerCase()} and reaches a specialist who can see all ${snapshot.summary.total} carts across every location. Email ${site.email} is answered the same day during event hours. There is no chatbot and no queue.`,
    ),
    snapshot.updatedAt.slice(0, 10),
  )}
  </div>
</div>

<section class="section">
  <div class="wrap contact-layout">
    <div class="prose">
      <h2>Call us</h2>
      <p class="contact-phone"><a href="${esc(site.phoneTel)}" data-testid="link-contact-phone">${esc(site.phone)}</a></p>
      <p>One number reaches every location. Whoever answers can see the whole inventory, so you do not need to work out which lot has the cart you want.</p>
${specTable(site.hoursDisplay.map((row) => [row.label, row.value] as [string, string]), "Hours")}
      <h2>Email</h2>
      <p><a href="mailto:${esc(site.email)}">${esc(site.email)}</a> — answered the same day during event hours.</p>
      <h3>Other addresses</h3>
      <ul>
        <li>Privacy requests: <a href="mailto:${esc(site.privacyEmail)}">${esc(site.privacyEmail)}</a></li>
        <li>Security reports: <a href="mailto:${esc(site.securityEmail)}">${esc(site.securityEmail)}</a></li>
      </ul>
      <h2>Visit a location</h2>
      <p>We have ${snapshot.stores.length} dealerships. Find the nearest on the <a href="${esc(withBase("/locations/"))}">locations page</a> and call ahead if you want a specific cart held.</p>
    </div>
    <div>
${leadForm({
    id: "contact",
    subject: `Website enquiry — ${site.domain}`,
    heading: "Send a message",
  })}
    </div>
  </div>
</section>

<section class="section section--surface">
  <div class="wrap">
    <h2>All ${snapshot.stores.length} locations</h2>
    <ul class="link-grid">
${snapshot.stores
  .map(
    (store) =>
      `      <li><a href="${esc(withBase(`/locations/${store.slug}/`))}">${esc(store.city)}, ${esc(store.stateCode)} (${store.cartCount})</a></li>`,
  )
  .join("\n")}
    </ul>
  </div>
</section>

${faqSection(faqEntries)}
${ctaBand()}`;

  return renderPage({
    path,
    title: clamp(`Contact ${site.name} — Call ${site.phone}`, 60),
    description: clamp(
      `Call ${site.phone} or email ${site.email} to reach a golf cart specialist across all ${snapshot.stores.length} locations. ${site.hoursSummary}`,
      155,
    ),
    body,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: path, label: "Contact" },
    ],
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    nodes: [faqNode(path, faqEntries)],
  });
}

/* --------------------------------------------------------------- service --- */

export function renderServicePage(snapshot: Snapshot): string {
  return simplePage({
    snapshot,
    path: "/service/",
    title: "Golf Cart Service, Parts & LSV Upfits",
    h1: "Golf Cart Service & Parts",
    description: `Golf cart service, parts, battery replacement and street-legal LSV upfits at ${snapshot.stores.length} locations — on carts we sold you and carts we did not. Call ${site.phone}.`,
    question: "What golf cart service do you offer?",
    answer: `We service any make: battery packs and chargers, motors and controllers, brakes and suspension, lift kits, tires, and full street-legal LSV upfits. Work is done at all ${snapshot.stores.length} locations on carts we sold and carts we did not. Call ${site.phone} to book.`,
    crumbLabel: "Service",
    keywords: ["golf cart service", "golf cart repair", "golf cart parts", "golf cart battery replacement", "LSV upfit"],
    body: `<h2>What do you service?</h2>
    <ul>
      <li><strong>Battery packs and chargers</strong> — testing, cell replacement, full lead-acid or lithium pack swaps, charger diagnosis.</li>
      <li><strong>Motors and controllers</strong> — speed and torque faults, controller programming, motor replacement.</li>
      <li><strong>Brakes and suspension</strong> — shoes, drums, cables, springs, shocks, bushings.</li>
      <li><strong>Lift kits and tires</strong> — installation, alignment after a lift, tire and rim packages.</li>
      <li><strong>Street-legal upfits</strong> — lighting, signals, mirrors, belts, windshield and VIN submission.</li>
      <li><strong>Gas engines</strong> — oil, filters, plugs, belts, carburettor service.</li>
    </ul>

    <h2>How much does a golf cart battery replacement cost?</h2>
${comparisonTable(
      ["Pack type", "Typical replacement cost", "Expected life"],
      [
        ["Lead-acid, 48V (6 × 8V)", "$900 – $1,400", "4 – 6 years"],
        ["Lead-acid, 48V (8 × 6V)", "$1,100 – $1,800", "4 – 6 years"],
        ["AGM, 48V", "$1,400 – $2,200", "5 – 7 years"],
        ["Lithium (LiFePO4), 48V", "$2,200 – $4,000", "8 – 10 years"],
      ],
      "Golf cart battery replacement cost by pack type",
    )}
    <p class="note">Ranges reflect what we quote across our locations; the exact figure depends on pack size and whether the tray and cabling need work. Call for a quote on your cart.</p>

    <h2>Can you make my existing cart street legal?</h2>
    <p>If it can reach 20 mph, usually yes. The upfit adds headlights, tail and brake lights, front and rear turn signals, reflectors, two mirrors, a DOT windshield, seat belts at every seat and a parking brake, then goes for a VIN. A cart that cannot reach 20 mph cannot become an LSV at any price — federal standard, not our rule. Read the <a href="${esc(withBase("/guides/street-legal-golf-carts-lsv-guide/"))}">street legal and LSV guide</a> first.</p>

    <h2>Do you sell parts over the counter?</h2>
    <p>Yes — batteries, chargers, controllers, motors, brakes, lift kits, tires, tops, windshields, seats and body panels for the brands we carry. Call ${esc(site.phone)} with your make, model and year.</p>`,
    related: [
      { href: "/guides/lithium-vs-lead-acid-golf-cart-batteries/", label: "Lithium versus lead-acid batteries compared" },
      { href: "/guides/golf-cart-tires-and-suspension/", label: "Golf cart tires and suspension guide" },
      { href: "/guides/street-legal-golf-carts-lsv-guide/", label: "Street legal and LSV requirements" },
      { href: "/trade-in/", label: "Trade in rather than repair" },
    ],
    faqEntries: pickFaq(["batteries", "street-legal", "contact"], 5),
  });
}

/* -------------------------------------------------------------- trade-in --- */

export function renderTradeInPage(snapshot: Snapshot): string {
  const path = "/trade-in/";
  const faqEntries = pickFaq(["trade-in", "pricing", "financing"], 5);

  const body = `<div class="page-head">
  <div class="wrap wrap-narrow">
    <h1>Trade In Your Golf Cart</h1>
${answerBlock(
    "How does trading in a golf cart work?",
    esc(
      `Bring the cart, the charger and any service records to any of our ${snapshot.stores.length} locations and we appraise it the same day. During the ${salesEvent.name} trade value stacks on top of event pricing rather than replacing it, so the discount and the trade both apply.`,
    ),
    snapshot.updatedAt.slice(0, 10),
  )}
  </div>
</div>

<section class="section">
  <div class="wrap contact-layout">
    <div class="prose">
      <h2>What is my golf cart worth?</h2>
      <p>Four things decide it, in this order:</p>
      <ol>
        <li><strong>Battery age and chemistry.</strong> On an electric cart this is most of the value. A lead-acid pack past four years is a deduction, not a feature.</li>
        <li><strong>Condition of the body and top.</strong> Cracks, fade and a torn top all come off.</li>
        <li><strong>Make and model.</strong> Club Car and E-Z-GO fleet platforms hold value because parts are everywhere.</li>
        <li><strong>What is fitted.</strong> A lift, a street-legal package, a decent sound system and new tires all add.</li>
      </ol>
      <h2>What should you bring?</h2>
      <ul>
        <li>The cart, and the charger that came with it.</li>
        <li>Any service records, especially a battery replacement receipt.</li>
        <li>The title if the cart is registered as an LSV.</li>
        <li>Keys — both, if you have them.</li>
      </ul>
      <h2>Does the trade change my financing?</h2>
      <p>It lowers the amount financed, so the monthly payment drops. See <a href="${esc(withBase("/financing/"))}">golf cart financing</a> for the payment table.</p>
      <h2>Will you take a cart that does not run?</h2>
      <p>Often, yes — a dead pack is a known quantity and we price around it. Tell us what it is doing when you call and we will give you a range before you load it.</p>
    </div>
    <div>
${leadForm({
    id: "trade-in",
    subject: `Trade-in appraisal request — ${site.domain}`,
    heading: "Get a trade appraisal",
    fields: [
      { name: "name", label: "Your name", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "cart", label: "Make, model and year", placeholder: "e.g. Club Car Precedent 2018" },
      { name: "battery", label: "Battery type and age", placeholder: "e.g. lead-acid, replaced 2022" },
      { name: "message", label: "Anything else we should know?", type: "textarea" },
    ],
  })}
    </div>
  </div>
</section>

${relatedLinks("After the trade", [
    { href: "/inventory/new/", label: "New golf carts with full warranty" },
    { href: "/inventory/used/", label: "Used and pre-owned golf carts" },
    { href: "/financing/", label: "0% APR financing for 48 months" },
    { href: "/service/", label: "Or repair the cart you have" },
  ])}
${faqSection(faqEntries)}
${ctaBand()}`;

  return renderPage({
    path,
    title: "Trade In Your Golf Cart — Same-Day Appraisal",
    description: clamp(
      `Same-day golf cart trade appraisals at ${snapshot.stores.length} locations. Trade value stacks on top of ${salesEvent.name} pricing. Call ${site.phone}.`,
      155,
    ),
    body,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: path, label: "Trade In" },
    ],
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    nodes: [faqNode(path, faqEntries)],
  });
}

/* -------------------------------------------------------------- delivery --- */

export function renderDeliveryPage(snapshot: Snapshot): string {
  const states = [...new Set(snapshot.stores.map((store) => store.state))].sort();
  return simplePage({
    snapshot,
    path: "/delivery/",
    title: "Golf Cart Delivery — Local & Nationwide",
    h1: "Golf Cart Delivery",
    description: `Local golf cart delivery from ${snapshot.stores.length} locations and nationwide enclosed transport, quoted by mileage. Call ${site.phone} with your ZIP code.`,
    question: "Do you deliver golf carts?",
    answer: `Yes. Local delivery runs from each of our ${snapshot.stores.length} dealerships, typically within a few days, and nationwide transport is arranged on enclosed or open trailers. Delivery is quoted by distance — call ${site.phone} with your ZIP code for a figure before you buy.`,
    crumbLabel: "Delivery",
    keywords: ["golf cart delivery", "golf cart shipping", "nationwide golf cart transport"],
    body: `<h2>How much does golf cart delivery cost?</h2>
    <p>It is priced by mileage and by whether the cart travels enclosed. As a guide: local delivery inside the metro area of a location is often included or nominal; regional runs are typically $150 to $400; cross-country enclosed transport runs $600 to $1,400. We quote the actual figure before you commit — there is no surprise on the invoice.</p>

    <h2>How long does it take?</h2>
${comparisonTable(
      ["Distance", "Typical lead time", "Method"],
      [
        ["Same metro area", "1 – 3 days", "Our own trailer"],
        ["Same state", "3 – 7 days", "Our own trailer"],
        ["Regional (up to ~500 miles)", "5 – 10 days", "Our trailer or a contracted carrier"],
        ["Nationwide", "7 – 21 days", "Contracted enclosed or open transport"],
      ],
      "Golf cart delivery lead times by distance",
    )}

    <h2>Which states do you deliver from?</h2>
    <p>Our locations sit in ${states.join(", ")}, and we deliver from all of them. Nationwide transport reaches the lower 48; Alaska, Hawaii and outside the United States are quoted case by case. Find your nearest lot on the <a href="${esc(withBase("/locations/"))}">locations page</a>.</p>

    <h2>What happens on delivery day?</h2>
    <ul>
      <li>The cart arrives charged, with its charger, keys and any paperwork.</li>
      <li>The driver walks the cart with you before unloading — note anything then, not later.</li>
      <li>On a street-legal cart, the title and VIN documentation come with it.</li>
      <li>We need somewhere a trailer can actually reach; tell us if access is tight.</li>
    </ul>

    <h2>Can you deliver to a rental property or campground?</h2>
    <p>Yes, and we do it regularly for seasonal renters and campground operators. Someone needs to be there to receive it and sign. If you are equipping a site with several carts, see <a href="${esc(withBase("/inventory/fleet/"))}">fleet golf carts</a>.</p>`,
    related: [
      { href: "/locations/", label: `All ${snapshot.stores.length} dealership locations` },
      { href: "/inventory/", label: "Browse every golf cart for sale" },
      { href: "/financing/", label: "0% APR financing for 48 months" },
      { href: "/contact/", label: "Ask about delivery to your address" },
    ],
    faqEntries: pickFaq(["delivery", "contact"], 4),
  });
}

/* ------------------------------------------------------------------- FAQ --- */

export function renderFaqPage(snapshot: Snapshot): string {
  const path = "/faq/";
  const topics = [...new Set(faq.map((entry) => entry.topic))];
  const entries = faq.map((entry) => ({ q: entry.q, a: entry.a }));

  const body = `<div class="page-head">
  <div class="wrap wrap-narrow">
    <h1>Golf Cart Questions & Answers</h1>
${answerBlock(
    "What do buyers most often ask?",
    esc(
      `The four questions that come up on nearly every call: what a golf cart costs, whether it can be driven on the road, how old the battery is on a used cart, and how the 0% financing works. All ${faq.length} of the questions below are answered from our own stock and our own lenders.`,
    ),
    snapshot.updatedAt.slice(0, 10),
  )}
  </div>
</div>

${topics
  .map((topic) => {
    const group = faq.filter((entry) => entry.topic === topic);
    return `<section class="section section--tight">
  <div class="wrap wrap-narrow">
    <h2>${esc(topic.replace(/-/g, " ").replace(/^./, (character) => character.toUpperCase()))}</h2>
    <div class="faq">
${group
  .map(
    (entry) => `      <details class="faq-item">
        <summary><h3>${esc(entry.q)}</h3></summary>
        <div class="faq-item__body"><p>${esc(entry.a)}</p></div>
      </details>`,
  )
  .join("\n")}
    </div>
  </div>
</section>`;
  })
  .join("\n")}

${relatedLinks("Still deciding?", [
    { href: "/guides/", label: "Read the golf cart buying guides" },
    { href: "/golf-carts-for-sale/", label: "Every golf cart for sale, explained" },
    { href: "/financing/", label: "How 0% APR financing works" },
    { href: "/contact/", label: "Ask a specialist directly" },
  ])}
${ctaBand()}`;

  return renderPage({
    path,
    title: "Golf Cart FAQ — Prices, LSVs, Batteries",
    description: clamp(
      `${faq.length} answers on golf cart prices, street-legal LSV rules, battery life, financing, trade-ins and delivery. Call ${site.phone} for anything not here.`,
      155,
    ),
    body,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: path, label: "FAQ" },
    ],
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    nodes: [faqNode(path, entries)],
  });
}

/* ---------------------------------------------------------------- guides --- */

export function renderGuidesIndex(snapshot: Snapshot): string {
  const path = "/guides/";
  const body = `<div class="page-head">
  <div class="wrap wrap-narrow">
    <h1>Golf Cart Buying Guides</h1>
${answerBlock(
    "What should you read before buying a golf cart?",
    esc(
      `Start with the battery decision, because it is the most expensive component and the one that ages: lithium against lead-acid. Then the street-legal rules if the cart will leave your property, and the tire and suspension guide if it will not stay on pavement. ${guides.length} guides below.`,
    ),
    snapshot.updatedAt.slice(0, 10),
  )}
  </div>
</div>

<section class="section">
  <div class="wrap">
    <div class="grid-3">
${guides
  .map(
    (guide) => `      <article class="article-card">
        <p class="article-card__meta">${esc(guide.category)} &middot; ${guide.readingMinutes} min read</p>
        <h2><a href="${esc(withBase(`/guides/${guide.slug}/`))}">${esc(guide.title)}</a></h2>
        <p>${esc(guide.description)}</p>
        <p class="note">Updated ${esc(guide.updated)}</p>
      </article>`,
  )
  .join("\n")}
    </div>
  </div>
</section>

${relatedLinks("Then shop", LISTING_ROUTES.slice(0, 8).map((route) => ({ href: route.path, label: route.h1 })))}
${ctaBand()}`;

  return renderPage({
    path,
    title: `Golf Cart Buying Guides — ${guides.length} Guides`,
    description: clamp(
      `${guides.length} golf cart buying guides: lithium vs lead-acid, street legal LSV rules, tires and suspension, off-road and lifted carts, electric vs gas, and a buying checklist.`,
      155,
    ),
    body,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: path, label: "Guides" },
    ],
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
  });
}

/** Guide body blocks: h2, h3, p, list, table, answer. */
export function guideBodyHtml(blocks: any[]): string {
  return blocks
    .map((block) => {
      if (block.h2) return `<h2>${esc(block.h2)}</h2>`;
      if (block.h3) return `<h3>${esc(block.h3)}</h3>`;
      // Prose may carry <a> and <strong>; everything else is stripped.
      if (block.p) return `<p>${block.p.replace(/<(?!\/?(?:a|strong|em)\b)[^>]*>/g, "")}</p>`;
      if (block.list) return `<ul>\n${block.list.map((item: string) => `  <li>${item.replace(/<(?!\/?(?:a|strong|em)\b)[^>]*>/g, "")}</li>`).join("\n")}\n</ul>`;
      if (block.ol) return `<ol>\n${block.ol.map((item: string) => `  <li>${esc(item)}</li>`).join("\n")}\n</ol>`;
      if (block.table) return comparisonTable(block.table.headers, block.table.rows, block.table.caption);
      return "";
    })
    .join("\n");
}

/** Plain-text form of a guide, for the AI/LLM text files. */
export function guideBodyText(blocks: any[]): string {
  return blocks
    .map((block) => {
      if (block.h2) return `\n## ${block.h2}`;
      if (block.h3) return `\n### ${block.h3}`;
      if (block.p) return String(block.p).replace(/<[^>]+>/g, "");
      if (block.list) return block.list.map((item: string) => `- ${String(item).replace(/<[^>]+>/g, "")}`).join("\n");
      if (block.ol) return block.ol.map((item: string, index: number) => `${index + 1}. ${item}`).join("\n");
      if (block.table) {
        return [
          block.table.headers.join(" | "),
          ...block.table.rows.map((row: string[]) => row.join(" | ")),
        ].join("\n");
      }
      return "";
    })
    .join("\n");
}

export function renderGuidePage(guide: any, snapshot: Snapshot): string {
  const path = `/guides/${guide.slug}/`;
  const others = guides.filter((entry) => entry.slug !== guide.slug).slice(0, 3);
  const faqEntries = guide.faq ?? [];

  const body = `<div class="page-head">
  <div class="wrap wrap-narrow">
    <p class="eyebrow">${esc(guide.category)} &middot; ${guide.readingMinutes} min read</p>
    <h1>${esc(guide.title)}</h1>
${answerBlock(guide.question ?? guide.title, esc(guide.answer ?? guide.description), guide.updated)}
    <p class="note">Published ${esc(guide.date)}${guide.updated !== guide.date ? ` &middot; Updated ${esc(guide.updated)}` : ""} by ${esc(site.name)}</p>
  </div>
</div>

<section class="section">
  <div class="wrap wrap-narrow">
    <article class="prose">
${guideBodyHtml(guide.body).replace(/href="(\/[^"]*)"/g, (match: string, href: string) => `href="${withBase(href)}"`)}
    </article>
    <ul class="tag-list" style="margin-top:32px">
${guide.tags.map((tag: string) => `      <li>${esc(tag)}</li>`).join("\n")}
    </ul>
  </div>
</section>

<section class="section section--surface">
  <div class="wrap">
    <h2>More golf cart guides</h2>
    <div class="grid-3">
${others
  .map(
    (entry) => `      <article class="article-card">
        <h3><a href="${esc(withBase(`/guides/${entry.slug}/`))}">${esc(entry.title)}</a></h3>
        <p>${esc(entry.description)}</p>
        <p class="article-card__meta">${esc(entry.category)} &middot; ${entry.readingMinutes} min read</p>
      </article>`,
  )
  .join("\n")}
    </div>
  </div>
</section>

${faqSection(faqEntries)}
${ctaBand()}`;

  return renderPage({
    path,
    title: clamp(guide.title, 60),
    description: clamp(guide.description, 155),
    body,
    ogType: "article",
    publishedAt: `${guide.date}T09:00:00+00:00`,
    modifiedAt: `${guide.updated}T09:00:00+00:00`,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: "/guides/", label: "Guides" },
      { href: path, label: guide.title },
    ],
    stores: snapshot.stores,
    head: `<meta name="keywords" content="${esc(guide.tags.join(", "))}">`,
    nodes: [articleNode(guide), ...(faqEntries.length ? [faqNode(path, faqEntries)] : [])],
  });
}

/* ----------------------------------------------------------------- legal --- */

const LEGAL: Record<string, { title: string; h1: string; question: string; answer: string; body: string }> = {
  privacy: {
    title: "Privacy Policy",
    h1: "Privacy Policy",
    question: "What data does this site collect?",
    answer:
      "This site is static: there is no database, no login and no analytics cookie set by us. The only personal data we receive is what you send deliberately — a form submission through our forms provider, an email, or a phone call. We do not sell it.",
    body: `<h2>What we collect</h2>
    <ul>
      <li><strong>Nothing automatically.</strong> The site is a set of static files. We set no cookies and run no analytics or advertising scripts.</li>
      <li><strong>What you send us.</strong> A contact or trade-in form submission is delivered to us by our forms provider (Formspree) and reaches us as email. An email or call gives us whatever you tell us.</li>
      <li><strong>Server logs.</strong> Our host records ordinary request logs, including IP address, as any web server does.</li>
    </ul>
    <h2>What we do with it</h2>
    <p>We use your contact details to answer your enquiry and, if you buy, to complete the sale, arrange delivery and provide service. We do not sell personal information, and we do not share it beyond what a transaction requires — a lender you choose to apply with, or a carrier delivering your cart.</p>
    <h2>Third parties</h2>
    <p>Form submissions pass through Formspree. Cart photography is served from Amazon S3. Financing applications are made directly on each lender's own site under their privacy policy, not ours.</p>
    <h2>Your rights</h2>
    <p>Email <a href="mailto:${site.privacyEmail}">${site.privacyEmail}</a> to ask what we hold, correct it, or have it deleted. We will respond within 30 days.</p>
    <h2>Children</h2>
    <p>This site is not directed at children under 13 and we do not knowingly collect their information.</p>`,
  },
  terms: {
    title: "Terms of Use",
    h1: "Terms of Use",
    question: "What are the terms for using this site?",
    answer:
      "Use the site to research and buy golf carts. Inventory, prices and specifications are drawn from our dealer management system and refreshed every six hours, but they are not an offer and can change or sell before you call. Nothing here is legal or financial advice.",
    body: `<h2>Inventory and pricing</h2>
    <p>Listings are generated from our dealer management system and refreshed roughly every six hours. A cart can sell between refreshes. Prices exclude tax, title, registration, delivery and any dealer fees, and are not a binding offer — the price you pay is the one on the paperwork you sign.</p>
    <h2>Specifications</h2>
    <p>Specifications, battery details, VINs and photographs are provided as our records hold them. We publish them because they are useful, not as a warranty. Confirm anything decisive before you buy.</p>
    <h2>Financing</h2>
    <p>0% APR for 48 months is subject to credit approval by a third-party lender. Payment figures on this site are arithmetic illustrations, not quotes. Terms come from the lender.</p>
    <h2>Street-legal use</h2>
    <p>Whether a low speed vehicle may be driven on a given road is decided by your state and municipality, not by us. Our guidance is a starting point; verify with your DMV.</p>
    <h2>Liability</h2>
    <p>The site is provided as is. We are not liable for indirect or consequential loss arising from its use. This does not limit any right you have that cannot lawfully be limited.</p>
    <h2>Contact</h2>
    <p>Questions about these terms: <a href="mailto:${site.email}">${site.email}</a> or ${site.phone}.</p>`,
  },
  accessibility: {
    title: "Accessibility Statement",
    h1: "Accessibility Statement",
    question: "Is this site accessible?",
    answer:
      "We build to WCAG 2.1 AA. Every page works from the keyboard, every image has descriptive alt text, colour contrast meets AA, and the site functions with JavaScript disabled — inventory filtering degrades to real prerendered category pages rather than breaking.",
    body: `<h2>What we have done</h2>
    <ul>
      <li>Semantic HTML with one h1 per page and a logical heading order.</li>
      <li>A skip link, visible focus styles and full keyboard operation.</li>
      <li>Descriptive alt text on every image, including inventory photographs, which name the year, make, model, colour, condition and location.</li>
      <li>Colour contrast meeting WCAG AA in both light and dark appearance.</li>
      <li>Explicit width and height on images so content does not shift as the page loads.</li>
      <li>Every page pre-rendered as HTML, so it reads correctly with JavaScript disabled or a screen reader that runs ahead of scripts.</li>
      <li>Form fields with real labels, and a phone and email route as an alternative to any form.</li>
    </ul>
    <h2>Known limitations</h2>
    <p>Inventory filtering uses JavaScript for instant results. Without it, the prerendered category pages — <a href="/inventory/new/">new</a>, <a href="/inventory/used/">used</a>, <a href="/inventory/street-legal/">street legal</a> and the rest — provide the same carts as ordinary links and pagination.</p>
    <h2>Telling us about a problem</h2>
    <p>If something on this site is not usable for you, email <a href="mailto:${site.email}">${site.email}</a> or call ${site.phone} and we will fix it and help you directly in the meantime.</p>`,
  },
};

export function renderLegalPage(kind: string, snapshot: Snapshot): string {
  const page = LEGAL[kind];
  return simplePage({
    snapshot,
    path: `/${kind}/`,
    title: `${page.title} | ${site.name}`,
    h1: page.h1,
    description: `${page.title} for ${site.name} — ${site.domain}.`,
    question: page.question,
    answer: esc(page.answer),
    crumbLabel: page.title,
    body: page.body.replace(/href="(\/[^"]*)"/g, (match, href) => `href="${withBase(href)}"`),
  });
}

/* ----------------------------------------------------------- html sitemap --- */

export function renderHtmlSitemap(snapshot: Snapshot): string {
  const path = "/sitemap/";
  const sections: Array<{ heading: string; links: Array<{ href: string; label: string }> }> = [
    {
      heading: "Main pages",
      links: [
        { href: "/", label: "Home" },
        { href: "/golf-carts-for-sale/", label: "Golf carts for sale" },
        { href: "/memorial-day-golf-cart-sales-event/", label: salesEvent.name },
        { href: "/financing/", label: "Financing" },
        { href: "/trade-in/", label: "Trade in" },
        { href: "/delivery/", label: "Delivery" },
        { href: "/service/", label: "Service and parts" },
        { href: "/about/", label: "About us" },
        { href: "/contact/", label: "Contact" },
        { href: "/faq/", label: "FAQ" },
      ],
    },
    {
      heading: "Inventory categories",
      links: LISTING_ROUTES.map((route) => ({ href: route.path, label: route.h1 })),
    },
    {
      heading: "Brands",
      links: [
        { href: "/brands/", label: "All brands" },
        ...snapshot.facets.makes.map((make) => ({
          href: `/brands/${brandSlug(make.key)}/`,
          label: `${make.label} golf carts (${make.count})`,
        })),
      ],
    },
    {
      heading: "Locations",
      links: [
        { href: "/locations/", label: "All locations" },
        ...snapshot.stores.map((store) => ({
          href: `/locations/${store.slug}/`,
          label: `${store.city}, ${store.stateCode} (${store.cartCount})`,
        })),
      ],
    },
    {
      heading: "Guides",
      links: [
        { href: "/guides/", label: "All guides" },
        ...guides.map((guide) => ({ href: `/guides/${guide.slug}/`, label: guide.title })),
      ],
    },
    {
      heading: "Legal",
      links: [
        { href: "/privacy/", label: "Privacy policy" },
        { href: "/terms/", label: "Terms of use" },
        { href: "/accessibility/", label: "Accessibility statement" },
      ],
    },
  ];

  const body = `<div class="page-head">
  <div class="wrap wrap-narrow">
    <h1>Sitemap</h1>
${answerBlock(
    "What is on this site?",
    esc(
      `Every page on ${site.domain}: ${snapshot.summary.total} individual golf cart listings, ${LISTING_ROUTES.length} inventory categories, ${snapshot.facets.makes.length} brand pages, ${snapshot.stores.length} location pages and ${guides.length} buying guides. The machine-readable version is at /sitemap.xml.`,
    ),
    snapshot.updatedAt.slice(0, 10),
  )}
  </div>
</div>

${sections
  .map(
    (section) => `<section class="section section--tight">
  <div class="wrap">
    <h2>${esc(section.heading)}</h2>
    <ul class="link-grid">
${section.links
  .map((link) => `      <li><a href="${esc(withBase(link.href))}">${esc(link.label)}</a></li>`)
  .join("\n")}
    </ul>
  </div>
</section>`,
  )
  .join("\n")}

<section class="section section--surface">
  <div class="wrap wrap-narrow prose">
    <h2>Every golf cart listing</h2>
    <p>All ${snapshot.summary.total} individual cart pages are indexed in <a href="${esc(withBase("sitemap.xml"))}">sitemap.xml</a>. Browse them from <a href="${esc(withBase("/inventory/"))}">the inventory listing</a>.</p>
  </div>
</section>

${ctaBand()}`;

  return renderPage({
    path,
    title: `Sitemap | ${site.name}`,
    description: clamp(
      `Every page on ${site.domain}: ${snapshot.summary.total} cart listings, ${LISTING_ROUTES.length} categories, ${snapshot.facets.makes.length} brands, ${snapshot.stores.length} locations and ${guides.length} guides.`,
      155,
    ),
    body,
    breadcrumbs: [
      { href: "/", label: "Home" },
      { href: path, label: "Sitemap" },
    ],
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
  });
}

/* ------------------------------------------------------------------- 404 --- */

export function renderNotFoundPage(snapshot: Snapshot): string {
  const body = `<div class="page-head">
  <div class="wrap wrap-narrow">
    <h1>That page does not exist</h1>
    <p class="page-head__lede">The link may be old, or a cart that was here has sold. Either way, here is where to go next.</p>
    <div class="hero__actions">
      <a class="btn btn--primary btn--lg" href="${esc(site.phoneTel)}">Call ${esc(site.phone)}</a>
      <a class="btn btn--outline btn--lg" href="${esc(withBase("/inventory/"))}">Browse ${snapshot.summary.total} golf carts</a>
    </div>
  </div>
</div>

${relatedLinks("Popular pages", [
    { href: "/golf-carts-for-sale/", label: "Golf carts for sale" },
    { href: "/inventory/new/", label: "New golf carts" },
    { href: "/inventory/used/", label: "Used and pre-owned golf carts" },
    { href: "/inventory/street-legal/", label: "Street legal golf carts and LSVs" },
    { href: "/inventory/utility/", label: "Utility golf carts" },
    { href: "/brands/", label: "Golf cart brands" },
    { href: "/locations/", label: "Dealership locations" },
    { href: "/financing/", label: "Financing" },
    { href: "/guides/", label: "Buying guides" },
    { href: "/contact/", label: "Contact us" },
  ])}
${ctaBand()}`;

  return renderPage({
    path: "/404.html",
    title: `Page not found | ${site.name}`,
    description: "That page does not exist. Browse the golf cart inventory or call us.",
    body,
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    noindex: true,
  });
}

export { FORMSPREE_FORM_ID };
