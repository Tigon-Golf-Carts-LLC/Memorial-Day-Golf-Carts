/**
 * Dealership location seed data.
 *
 * City / state / coordinates / service areas are maintained here because they
 * drive geo SEO files that must exist even when the build runs offline.
 * Street addresses, postal codes, store names and store IDs are authoritative
 * in the DMS (`GET /tigon-stores`) and are merged over this seed by
 * script/fetch-data.ts on every daily build.
 */

export const locations = [
  {
    slug: "hatfield",
    city: "Hatfield",
    state: "Pennsylvania",
    stateCode: "PA",
    lat: 40.2793,
    lng: -75.2993,
    county: "Montgomery County",
    region: "Greater Philadelphia",
    serviceArea: ["Montgomery County", "Bucks County", "Lehigh Valley", "Philadelphia", "Doylestown", "Lansdale"],
    keywords: ["Hatfield golf carts", "Montgomery County PA golf cart dealer", "Philadelphia Memorial Day golf cart sale"],
  },
  {
    slug: "bayville",
    city: "Bayville",
    state: "New Jersey",
    stateCode: "NJ",
    lat: 39.9026,
    lng: -74.1521,
    county: "Ocean County",
    region: "Jersey Shore",
    serviceArea: ["Ocean County", "Toms River", "Lacey Township", "Barnegat", "Seaside Heights"],
    keywords: ["Bayville NJ golf carts", "Ocean County golf cart dealer", "Jersey Shore Memorial Day cart sale"],
  },
  {
    slug: "dover",
    city: "Dover",
    state: "Delaware",
    stateCode: "DE",
    lat: 39.1582,
    lng: -75.5244,
    county: "Kent County",
    region: "Central Delaware",
    serviceArea: ["Kent County", "Smyrna", "Milford", "Camden", "Harrington"],
    keywords: ["Dover DE golf carts", "Kent County Delaware golf cart dealer", "Delaware Memorial Day golf cart event"],
  },
  {
    slug: "ocean-view",
    city: "Ocean View",
    state: "New Jersey",
    stateCode: "NJ",
    lat: 39.2073,
    lng: -74.7268,
    county: "Cape May County",
    region: "Cape May",
    serviceArea: ["Cape May County", "Sea Isle City", "Avalon", "Stone Harbor", "Ocean City", "Dennis Township", "Woodbine"],
    keywords: ["Ocean View NJ golf carts", "Cape May County golf cart dealer", "Sea Isle City Memorial Day golf cart sale"],
  },
  {
    slug: "rio-grande",
    city: "Rio Grande",
    state: "New Jersey",
    stateCode: "NJ",
    lat: 39.0140,
    lng: -74.8813,
    county: "Cape May County",
    region: "Cape May",
    serviceArea: ["Cape May County", "Wildwood", "Cape May", "Stone Harbor", "Avalon", "Ocean City"],
    keywords: ["Rio Grande NJ golf carts", "Cape May golf cart dealer", "Wildwood Memorial Day golf cart sale"],
  },
  {
    slug: "waretown",
    city: "Waretown",
    state: "New Jersey",
    stateCode: "NJ",
    lat: 39.7929,
    lng: -74.1968,
    county: "Ocean County",
    region: "Long Beach Island",
    serviceArea: ["Ocean County", "Long Beach Island", "Barnegat", "Manahawkin", "Forked River"],
    keywords: ["Waretown NJ golf carts", "LBI golf cart sales", "Long Beach Island Memorial Day cart deals"],
  },
  {
    slug: "long-pond",
    city: "Long Pond",
    state: "Pennsylvania",
    stateCode: "PA",
    lat: 41.0562,
    lng: -75.4585,
    county: "Monroe County",
    region: "Pocono Mountains",
    serviceArea: ["Monroe County", "Blakeslee", "Tannersville", "Mount Pocono", "Stroudsburg", "Scotrun", "Swiftwater", "Bushkill"],
    keywords: ["Long Pond PA golf carts", "Pocono golf cart dealer", "Poconos Memorial Day golf cart sale"],
  },
  {
    slug: "scranton-wilkes-barre",
    city: "Scranton",
    state: "Pennsylvania",
    stateCode: "PA",
    lat: 41.4090,
    lng: -75.6624,
    county: "Lackawanna County",
    region: "Northeastern Pennsylvania",
    serviceArea: ["Lackawanna County", "Luzerne County", "Wilkes-Barre", "Pittston", "Clarks Summit"],
    keywords: ["Scranton golf carts", "Wilkes-Barre golf cart dealer", "NEPA Memorial Day golf cart event"],
  },
  {
    slug: "gloucester-point",
    city: "Gloucester Point",
    state: "Virginia",
    stateCode: "VA",
    lat: 37.2543,
    lng: -76.4969,
    county: "Gloucester County",
    region: "Virginia Peninsula",
    serviceArea: ["Gloucester County", "Yorktown", "Williamsburg", "Newport News", "Hampton"],
    keywords: ["Gloucester Point VA golf carts", "Virginia Peninsula golf cart dealer", "Williamsburg golf cart sale"],
  },
  {
    slug: "raleigh",
    city: "Raleigh",
    state: "North Carolina",
    stateCode: "NC",
    lat: 35.7796,
    lng: -78.6382,
    county: "Wake County",
    region: "Research Triangle",
    serviceArea: ["Wake County", "Durham", "Cary", "Apex", "Wake Forest", "Chapel Hill"],
    keywords: ["Raleigh golf carts", "Triangle NC golf cart dealer", "North Carolina Memorial Day golf cart sale"],
  },
  {
    slug: "orangeburg",
    city: "Orangeburg",
    state: "South Carolina",
    stateCode: "SC",
    lat: 33.4918,
    lng: -80.8556,
    county: "Orangeburg County",
    region: "Midlands",
    serviceArea: ["Orangeburg County", "Santee", "Columbia", "Summerville", "Lake Marion"],
    keywords: ["Orangeburg SC golf carts", "South Carolina golf cart dealer", "Lake Marion golf cart sales event"],
  },
  {
    slug: "lecanto",
    city: "Lecanto",
    state: "Florida",
    stateCode: "FL",
    lat: 28.8511,
    lng: -82.4837,
    county: "Citrus County",
    region: "Nature Coast",
    serviceArea: ["Citrus County", "Crystal River", "Homosassa", "Inverness", "Beverly Hills FL"],
    keywords: ["Lecanto FL golf carts", "Citrus County golf cart dealer", "Florida Memorial Day golf cart sale"],
  },
  {
    slug: "south-bend",
    city: "South Bend",
    state: "Indiana",
    stateCode: "IN",
    lat: 41.6764,
    lng: -86.2520,
    county: "St. Joseph County",
    region: "Michiana",
    serviceArea: ["St. Joseph County", "Mishawaka", "Elkhart", "Granger", "Niles MI"],
    keywords: ["South Bend golf carts", "Michiana golf cart dealer", "Indiana Memorial Day golf cart event"],
  },
  {
    slug: "swanton",
    city: "Swanton",
    state: "Ohio",
    stateCode: "OH",
    lat: 41.5878,
    lng: -83.8916,
    county: "Fulton County",
    region: "Greater Toledo",
    serviceArea: ["Fulton County", "Lucas County", "Toledo", "Maumee", "Sylvania", "Delta", "Wauseon", "Holland"],
    keywords: ["Swanton OH golf carts", "Toledo golf cart dealer", "Northwest Ohio Memorial Day golf cart sale"],
  },
  {
    slug: "wichita-falls",
    city: "Wichita Falls",
    state: "Texas",
    stateCode: "TX",
    lat: 33.9137,
    lng: -98.4934,
    county: "Wichita County",
    region: "North Texas",
    serviceArea: ["Wichita County", "Sheppard Air Force Base", "Burkburnett", "Iowa Park", "Henrietta", "Vernon", "Bowie"],
    keywords: ["Wichita Falls golf carts", "North Texas golf cart dealer", "Texas Memorial Day golf cart sale"],
  },
];

/**
 * Full US state name -> USPS code. Needed because a DMS store can appear in a
 * state we have not seeded, and the code cannot be derived by truncating the
 * name ("New Jersey" is NJ, not NE; "Texas" is TX, not TE).
 */
export const stateAbbreviations = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY", "District of Columbia": "DC", "Puerto Rico": "PR",
};

/** Resolve a state name or code to its USPS two-letter code. */
export function toStateCode(state) {
  const value = String(state ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  return stateAbbreviations[value] ?? stateAbbreviations[
    Object.keys(stateAbbreviations).find((name) => name.toLowerCase() === value.toLowerCase()) ?? ""
  ] ?? "";
}

export default locations;
