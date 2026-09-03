/**
 * Vehicle detail page — /golfcart/<slug>/.
 *
 * One per cart in the snapshot. Carries the Vehicle/Product schema whose
 * `itemCondition` is derived from the same normalized `condition` the filters
 * use, a specification table (which is what machines extract cleanly), the
 * phone CTA required by Phase 8, and a gallery whose images all ship explicit
 * dimensions and descriptive alt text.
 */

import { site, salesEvent, S3_CARTS_URL } from "../../src/config/site.ts";
import { esc, withBase, absoluteUrl, formatPrice, monthlyPayment, clamp, titleize } from "../lib/util.ts";
import { renderPage } from "../lib/layout.ts";
import { cartCard, specTable, ctaBand, faqSection, answerBlock } from "../lib/components.ts";
import { vehicleNode, faqNode, type Crumb, type Store } from "../lib/schema.ts";
import { renderImage, cartImageEntry, cartImageAlt } from "../lib/images.ts";
import { FEATURE_LABELS, type FilterableCart } from "../../src/lib/filters.ts";
import { pickFaq } from "./inventory.ts";

export interface VehiclePageOptions {
  cart: FilterableCart & Record<string, any>;
  snapshot: { updatedAt: string; stores: Store[] };
  related: FilterableCart[];
}

/** The gallery: primary image as the hero, the rest as switchable thumbnails. */
function gallery(cart: any): string {
  const images: string[] = cart.images ?? [];
  if (!images.length) {
    return `<div class="gallery"><img src="${esc(withBase("images/cart-photo-coming-soon.svg"))}" alt="Photograph coming soon for this ${esc(cart.title)} golf cart" width="800" height="600" loading="eager" decoding="async"></div>`;
  }

  const heroEntry = cartImageEntry(images[0]);
  const hero = renderImage(heroEntry, S3_CARTS_URL + images[0], {
    alt: cartImageAlt(cart, 0),
    role: "hero",
    eager: true,
    picture: true,
    attrs: { "data-gallery-main": "" },
  });

  const thumbs = images
    .map((filename, index) => {
      const entry = cartImageEntry(filename);
      const large = entry ? withBase(`${entry.base}-${entry.widths[entry.widths.length - 1]}.webp`) : S3_CARTS_URL + filename;
      const thumb = renderImage(entry, S3_CARTS_URL + filename, {
        alt: cartImageAlt(cart, index),
        role: "thumb",
      });
      return `      <button class="gallery__thumb" type="button" data-gallery-thumb data-src="${esc(large)}" data-alt="${esc(cartImageAlt(cart, index))}" aria-current="${index === 0 ? "true" : "false"}" aria-label="Show photo ${index + 1} of ${images.length}">${thumb}</button>`;
    })
    .join("\n");

  return `<div class="gallery" data-gallery>
  <div class="gallery__main">${hero}</div>
${images.length > 1 ? `  <div class="gallery__thumbs" role="group" aria-label="Photographs of this golf cart">\n${thumbs}\n  </div>` : ""}
</div>`;
}

export function renderVehiclePage(options: VehiclePageOptions): string {
  const { cart, snapshot, related } = options;
  const path = `/golfcart/${cart.slug}/`;
  const heading = [cart.year, cart.title].filter(Boolean).join(" ");
  const conditionWord = cart.condition === "used" ? "Used" : "New";
  const fuelWord = cart.fuel === "electric" ? "Electric" : "Gas";
  const monthly = monthlyPayment(cart.price);

  const where = cart.city ? `${cart.city}, ${cart.stateCode}` : "";
  const featureLabels = (cart.features ?? []).map((feature: string) => FEATURE_LABELS[feature] ?? titleize(feature));

  // Answer-first: 40–60 words that state exactly what this cart is and costs.
  const answer =
    `This ${conditionWord.toLowerCase()} ${heading} is a ${fuelWord.toLowerCase()} golf cart` +
    `${cart.passengersLabel ? ` configured for ${cart.passengersLabel.toLowerCase()}` : ""}` +
    `${featureLabels.length ? `, fitted ${featureLabels.slice(0, 3).join(", ").toLowerCase()}` : ""}. ` +
    `${cart.price ? `It is priced at ${formatPrice(cart.price)}, or about $${Math.round(monthly!).toLocaleString("en-US")} a month at 0% APR over 48 months. ` : "Call for current pricing. "}` +
    `${where ? `It is on the lot in ${where} and available now.` : "It is available now."}`;

  const specs: Array<[string, string]> = [
    ["Condition", conditionWord],
    ["Year", cart.year ? String(cart.year) : ""],
    ["Make", cart.makeLabel],
    ["Model", cart.modelLabel],
    ["Power", fuelWord],
    ["Colour", cart.colorLabel],
    ["Seat colour", cart.seatColor ?? ""],
    ["Passengers", cart.passengersLabel],
    ["Drivetrain", cart.drivetrain ? cart.drivetrain.toUpperCase() : ""],
    ["Tires", cart.tire ? titleize(cart.tire) : ""],
    ["Rim size", cart.tireRimSize ? `${cart.tireRimSize} inch` : ""],
    ["Street legal (LSV)", cart.features?.includes("street-legal") ? "Yes" : "No"],
    ["Lifted", cart.features?.includes("lifted") ? "Yes" : "No"],
    ["Tow hitch", cart.features?.includes("hitch") ? "Yes" : ""],
    ["Sound system", cart.features?.includes("sound-system") ? "Yes" : ""],
    ["Extended top", cart.features?.includes("extended-top") ? "Yes" : ""],
    ["Odometer", cart.odometer ? `${cart.odometer.toLocaleString("en-US")} miles` : ""],
    ["Engine hours", cart.hours ? String(cart.hours) : ""],
    ["Warranty", cart.warranty ?? ""],
    ["VIN", cart.vin ?? ""],
    ["Stock number", cart.id],
  ];

  const batterySpecs: Array<[string, string]> = cart.batterySpec
    ? [
        ["Chemistry", cart.batterySpec.typeLabel || titleize(cart.battery)],
        ["Brand", cart.batterySpec.brand ?? ""],
        ["Pack year", cart.batterySpec.year ?? ""],
        ["Pack voltage", cart.batterySpec.packVoltage ? `${cart.batterySpec.packVoltage}V` : ""],
        ["Amp hours", cart.batterySpec.ampHours ?? ""],
        ["Battery warranty", cart.batterySpec.warrantyLength ?? ""],
      ]
    : [];

  const imageUrls = (cart.images ?? []).map((filename: string) => {
    const entry = cartImageEntry(filename);
    return entry ? absoluteUrl(`${entry.base}-${entry.widths[entry.widths.length - 1]}.webp`) : S3_CARTS_URL + filename;
  });

  const breadcrumbs: Crumb[] = [
    { href: "/", label: "Home" },
    { href: "/inventory/", label: "Inventory" },
    ...(cart.makeLabel ? [{ href: `/brands/${cart.make.replace(/_/g, "-")}/`, label: cart.makeLabel }] : []),
    { href: path, label: heading },
  ];

  const faqEntries = [
    {
      q: `Is this ${cart.makeLabel || "golf cart"} still available?`,
      a: `Yes — this listing is generated from our dealer management system, which the site re-reads every six hours, so it is on the lot as of ${snapshot.updatedAt.slice(0, 10)}. Call ${site.phone} to confirm before you travel.`,
    },
    ...(cart.price
      ? [
          {
            q: `What would the monthly payment be on this cart?`,
            a: `At the event's 0% APR for 48 months on approved credit, ${formatPrice(cart.price)} works out to about $${Math.round(monthly!).toLocaleString("en-US")} a month with no interest. Tax, title and any delivery are separate.`,
          },
        ]
      : []),
    {
      q: cart.features?.includes("street-legal")
        ? "Can this cart be registered for the road?"
        : "Can this cart be made street legal?",
      a: cart.features?.includes("street-legal")
        ? `This cart is built to Low Speed Vehicle specification — lights, signals, mirrors, seat belts, a windshield and a VIN — so it can be titled and registered in states that permit LSVs on roads posted 35 mph or below. Confirm the rules with your own DMV.`
        : `This cart is not currently built to LSV specification. If it can reach 20 mph it can usually be upgraded with a lighting, mirror, belt and windshield package and submitted for a VIN. Call ${site.phone} for a quote on this specific cart.`,
    },
    ...(cart.condition === "used" && cart.batterySpec?.year
      ? [
          {
            q: "How old is the battery pack in this used cart?",
            a: `Our records show a ${cart.batterySpec.typeLabel || cart.battery} pack from ${cart.batterySpec.year}. On a used cart the pack age is the single biggest factor in value, which is why we publish it rather than leaving you to ask.`,
          },
        ]
      : []),
    {
      q: "Can you deliver this cart?",
      a: `Yes. We deliver locally from ${where || "the holding location"} and arrange nationwide transport. Delivery is quoted by distance — call ${site.phone} with your ZIP code for a figure.`,
    },
  ];

  const title = clamp(
    `${heading} — ${cart.price ? formatPrice(cart.price) : "Call for Price"}`,
    60,
  );
  const description = clamp(
    `${conditionWord} ${heading} ${fuelWord.toLowerCase()} golf cart for sale${where ? ` in ${where}` : ""}. ` +
      `${cart.price ? `${formatPrice(cart.price)}, 0% APR for 48 months.` : "Call for price."} ${featureLabels.slice(0, 2).join(", ")}`,
    155,
  );

  const body = `<div class="vehicle">
  <div class="wrap vehicle__layout">
    <div class="vehicle__media">
${gallery(cart)}
    </div>
    <div class="vehicle__info">
      <p class="eyebrow">${esc(salesEvent.name)}</p>
      <h1>${esc(heading)}</h1>
      <div class="vehicle__badges">
        <span class="badge badge--${cart.condition === "used" ? "used" : "new"}" data-testid="badge-condition">${esc(conditionWord)}</span>
        <span class="badge badge--${cart.fuel === "electric" ? "electric" : "gas"}">${esc(fuelWord)}</span>
${featureLabels.map((label: string) => `        <span class="badge">${esc(label)}</span>`).join("\n")}
      </div>
      <div class="vehicle__price">
        <span class="vehicle__price-value" data-testid="text-price">${esc(formatPrice(cart.price))}</span>
${monthly ? `        <span class="vehicle__price-mo">$${Math.round(monthly).toLocaleString("en-US")}/mo &middot; 0% APR for 48 months</span>` : ""}
      </div>
${answerBlock(`What is this ${cart.makeLabel || "golf"} cart?`, esc(answer), snapshot.updatedAt.slice(0, 10))}
      <div class="vehicle__cta">
        <a class="btn btn--primary btn--lg" href="${esc(site.phoneTel)}" data-testid="link-vehicle-phone">Call ${esc(site.phone)}</a>
        <a class="btn btn--outline btn--lg" href="mailto:${esc(site.email)}?subject=${esc(`Inquiry: ${heading} (stock ${cart.id})`)}&amp;body=${esc(`I am interested in the ${heading} listed at ${absoluteUrl(path)}.`)}" data-testid="link-vehicle-email">Email about this cart</a>
      </div>
      <p class="note">${esc(site.hoursSummary)}${where ? ` &middot; On the lot in <a href="${withBase(`/locations/${cart.location}/`)}">${esc(where)}</a>` : ""}</p>
    </div>
  </div>
</div>

<section class="section">
  <div class="wrap vehicle__specs">
    <div>
      <h2>Specifications</h2>
${specTable(specs, `${heading} specifications`)}
    </div>
${batterySpecs.length
    ? `    <div>
      <h2>Battery</h2>
${specTable(batterySpecs, `${heading} battery specification`)}
      <p class="note">${cart.condition === "used" ? "Pack age is published on every used listing so you can price a future replacement into your offer." : "New carts ship with a current-generation pack under full manufacturer warranty."}</p>
    </div>`
    : ""}
  </div>
</section>

${related.length
    ? `<section class="section section--surface">
  <div class="wrap">
    <h2>Similar golf carts in stock</h2>
    <div class="grid-carts">
${related.map((entry) => cartCard(entry as never, false)).join("\n")}
    </div>
    <p><a href="${esc(withBase("/inventory/"))}">See all golf carts for sale</a>${cart.makeLabel ? ` or browse every <a href="${esc(withBase(`/brands/${cart.make.replace(/_/g, "-")}/`))}">${esc(cart.makeLabel)} golf cart</a> we have` : ""}.</p>
  </div>
</section>`
    : ""}

${faqSection(faqEntries, "About this golf cart")}
${ctaBand(
    `Ready to see this ${cart.makeLabel || "cart"} in person?`,
    `Call ${site.phone} and we will confirm it is still on the lot in ${where || "stock"}, hold it for you, and quote delivery to your address.`,
  )}`;

  return renderPage({
    path,
    title,
    description,
    body,
    breadcrumbs,
    stores: snapshot.stores,
    modifiedAt: snapshot.updatedAt,
    ogType: "product",
    ogImage: imageUrls[0]
      ? imageUrls[0].replace(absoluteUrl("/"), "").replace(/^https?:\/\/[^/]+\//, "")
      : undefined,
    head: `<meta name="keywords" content="${esc(
      [
        `${cart.makeLabel} ${cart.modelLabel} for sale`.trim(),
        `${cart.condition} golf carts`,
        `${cart.fuel} golf cart`,
        where ? `golf carts ${where}` : "",
        ...featureLabels.map((label: string) => label.toLowerCase()),
      ]
        .filter(Boolean)
        .join(", "),
    )}">`,
    nodes: [vehicleNode(cart as never, imageUrls), faqNode(path, faqEntries)],
  });
}
