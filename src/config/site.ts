/**
 * Memorial Day Golf Carts — central site configuration.
 *
 * Every page, sitemap, feed and AI/SEO file reads its facts from this file, so
 * business details only ever need to be changed in one place. Entity
 * consistency (Phase 7 AEO) depends on it: the NAP that appears in visible
 * text, in `tel:` hrefs and in JSON-LD all resolve from here.
 */

export const site = {
  name: "Memorial Day Golf Carts",
  shortName: "Memorial Day Carts",
  legalName: "Memorial Day Golf Carts",
  domain: "memorialdaygolfcarts.com",
  url: "https://memorialdaygolfcarts.com",
  tagline: "The Memorial Day Golf Cart Sales Event",
  founded: "2016",
  description:
    "Memorial Day Golf Carts hosts the nation's biggest Memorial Day Golf Cart Sales Event — Memorial Day pricing on new, used and pre-owned golf carts, street legal LSVs, utility and fleet golf carts, with 0% APR financing across 15 dealership locations.",
  shortDescription:
    "Memorial Day Golf Cart Sales Event — savings on new & used golf carts with 0% APR financing.",
  // Phase 8: this number is the primary CTA. It must stay byte-identical in the
  // visible text, the tel: href and the JSON-LD telephone property.
  phone: "844-456-2228",
  phoneE164: "+18444562228",
  phoneTel: "tel:+18444562228",
  email: "sales@memorialdaygolfcarts.com",
  securityEmail: "security@memorialdaygolfcarts.com",
  privacyEmail: "privacy@memorialdaygolfcarts.com",
  locale: "en_US",
  language: "en-US",
  country: "US",
  currency: "USD",
  priceRange: "$$-$$$",
  themeColor: "#1b2a4a",
  backgroundColor: "#0b1224",
  twitter: "@MemDayCarts",
  social: [
    "https://www.facebook.com/memorialdaygolfcarts",
    "https://www.instagram.com/memorialdaygolfcarts",
    "https://www.youtube.com/@memorialdaygolfcarts",
    "https://x.com/MemDayCarts",
  ],
  // Every location keeps the same hours. Sunday is deliberately absent from
  // `hours`: schema.org treats an omitted day as closed.
  hours: [
    {
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens: "09:00",
      closes: "17:00",
    },
  ],
  hoursDisplay: [
    { label: "Monday – Saturday", value: "9:00 AM – 5:00 PM" },
    { label: "Sunday", value: "Closed" },
  ],
  hoursSummary: "Monday – Saturday, 9:00 AM – 5:00 PM. Closed Sunday.",
} as const;

/**
 * Public display name for a dealership location.
 *
 * The dealer management system returns each store under the parent group's
 * name. This site is branded for the sales event, so that name is never shown —
 * every location renders through this template instead.
 */
export function storeDisplayName(city: string, state: string): string {
  return `Memorial Day Golf Carts Sale location In ${city} ${state}`;
}

/** The sales event this whole site is built around. */
export const salesEvent = {
  name: "Memorial Day Golf Cart Sales Event",
  altName: "Memorial Day Golf Cart Sale",
  headline: "The Memorial Day Golf Cart Sales Event",
  subhead:
    "Memorial Day pricing on every new, used and pre-owned golf cart in stock. 0% APR for 48 months and the largest Memorial Day golf cart selection in the country.",
  // Memorial Day is the last Monday in May; the event runs the fortnight around it.
  startMonthDay: "05-15",
  endMonthDay: "06-02",
  offers: [
    "Memorial Day pricing on every cart in stock",
    "0% APR financing for 48 months on approved credit",
    "Local and nationwide delivery available",
    "Trade-ins welcomed and appraised same day",
    "Lifted, street legal, utility and fleet models included",
  ],
} as const;

/** Financing partners (shown on /financing and in schema). */
export const financingPartners = [
  { name: "Sheffield BBT", url: "https://prequalify.sheffieldfinancial.com/Apply/Dealer/56712?source=web", blurb: "Long-term fixed-rate recreational financing with fast decisions." },
  { name: "BLI Heartland", url: "https://blirentals.com/app/TIGON_GOLFCARTS_LLC", blurb: "Flexible terms and seasonal payment options for powersports buyers." },
  { name: "DLL Financial", url: "https://applynow-cica-prd.dllgroup.com/?entityId=4&dealerCode=015639", blurb: "Established equipment lender with competitive promotional rates." },
  { name: "Roadrunner / Octane", url: "https://octane.co/flex/034170", blurb: "Soft-pull prequalification in minutes with no credit score impact." },
  { name: "Univest Capital", url: "https://form.jotform.com/UnivestCapital/credit-application-bakos?utm_source=Memorial+Day+Golf+Carts&utm_medium=Financing&utm_campaign=Business&utm_term=Best+Golf+Cart+Financing", blurb: "Commercial and fleet financing for resorts, clubs and communities." },
  { name: "Dealer Direct", url: "https://dealerdirect.apptraker.com/my/guest?dealer=10735", blurb: "Multi-lender marketplace matching you to the best available offer." },
] as const;

/**
 * Primary + supporting keyword strategy (Phase 7).
 *
 * `primary` holds the ten phrases the brief names as the ranking target; the
 * pillar page at /golf-carts-for-sale/ owns them and every cluster page links
 * back to it with descriptive anchor text.
 */
export const keywords = {
  primary: [
    "Golf Cart",
    "Golf Carts For Sale",
    "Utility Golf Carts",
    "Street Legal Golf Carts",
    "New Golf Carts",
    "Used Golf Carts",
    "Pre Owned Golf Carts",
    "Low Speed Golf Carts",
    "Golf Cart Vehicle Marketplace",
    "Fleet Golf Carts",
  ],
  event: [
    "Memorial Day golf cart sales event",
    "Memorial Day golf cart sale",
    "Memorial Day golf cart deals",
    "Memorial Day weekend golf cart specials",
    "Memorial Day golf cart clearance",
  ],
  cluster: [
    "off-road golf carts",
    "lifted golf carts",
    "4x4 golf carts",
    "street legal all terrain carts",
    "lithium vs lead-acid golf cart batteries",
    "golf cart tire and suspension guide",
    "electric golf carts for sale",
    "gas golf carts for sale",
    "6 passenger golf carts",
    "low speed vehicles LSV",
  ],
  longTail: [
    "best Memorial Day golf cart sales event near me",
    "where to buy a golf cart on Memorial Day weekend",
    "Memorial Day golf cart financing 0 percent APR",
    "street legal golf cart sale with delivery",
    "how much does a utility golf cart cost",
    "lifted lithium golf cart Memorial Day deal",
    "trade in my golf cart during the Memorial Day sale",
    "fleet golf carts for resorts and communities",
  ],
  voice: [
    "who has a Memorial Day golf cart sales event near me",
    "what is the best Memorial Day golf cart deal",
    "are golf carts cheaper on Memorial Day",
    "find me a street legal golf cart for sale this weekend",
    "call the Memorial Day golf cart sales event",
  ],
  transactional: [
    "buy golf cart Memorial Day",
    "golf cart sales event financing",
    "golf cart dealership near me open today",
    "golf cart price quote Memorial Day",
  ],
} as const;

export const nav = [
  { href: "/", label: "Home" },
  { href: "/memorial-day-golf-cart-sales-event/", label: "Memorial Day Event" },
  { href: "/inventory/", label: "Inventory" },
  { href: "/inventory/new/", label: "New" },
  { href: "/inventory/used/", label: "Used" },
  { href: "/brands/", label: "Brands" },
  { href: "/locations/", label: "Locations" },
  { href: "/financing/", label: "Financing" },
  { href: "/contact/", label: "Contact" },
] as const;

/** Public S3 bucket that serves DMS cart photography (raw originals). */
export const S3_CARTS_URL = "https://s3.amazonaws.com/prod.docs.s3/carts/";
export const PLACEHOLDER_IMAGE = "images/cart-photo-coming-soon.svg";
export const DMS_BASE_URL = process.env.DMS_BASE_URL || "https://api.tigondms.com/wp-website";

export default site;
