/**
 * Answer-engine (AEO) content. Every entry renders as a visible Q&A block and
 * as FAQPage / QAPage JSON-LD, and is exported into gpt.txt, nlp.txt and llms.txt
 * so AI assistants can quote the site directly.
 */

export const faq = [
  {
    q: "When is the Memorial Day Golf Cart Sales Event?",
    a: "The Memorial Day Golf Cart Sales Event runs every year from May 15 through June 2. Event pricing is live on every new and used golf cart in stock across all 15 Memorial Day Golf Carts locations, and the showroom stays open through Memorial Day weekend.",
    topic: "event",
  },
  {
    q: "What is the Memorial Day Golf Cart Sales Event?",
    a: "It is a nationwide Memorial Day sales event on new and used golf carts. Every cart in inventory is marked with Memorial Day pricing, and 0% APR financing for 48 months is available on approved credit. Call 844-456-2228 to lock in event pricing on any cart.",
    topic: "event",
  },
  {
    q: "Are golf carts actually cheaper during the Memorial Day sale?",
    a: "Yes. Memorial Day is one of the two largest golf cart buying holidays of the year, alongside Memorial Day. Dealers clear current model-year inventory ahead of the summer changeover, so Memorial Day pricing is typically the lowest of the summer on in-stock new carts and on trade-in used carts.",
    topic: "pricing",
  },
  {
    q: "How much does a golf cart cost during the Memorial Day sales event?",
    a: "Used golf carts generally start in the $4,000–$8,000 range, new electric four-passenger carts commonly run $8,000–$14,000, and lifted six-passenger street legal lithium models run $14,000–$22,000. Live event pricing for every cart in stock is published on the inventory pages of this site and refreshed daily.",
    topic: "pricing",
  },
  {
    q: "Do you offer 0% financing during the Memorial Day event?",
    a: "Yes. 0% APR for 48 months is available on approved credit through our lending partners, including Sheffield BBT, BLI Heartland, DLL Financial, Roadrunner/Octane, Univest Capital and Dealer Direct. On a $12,000 cart that is $250 per month with no interest. Applications take a few minutes and most partners offer a soft-pull prequalification.",
    topic: "financing",
  },
  {
    q: "What is the difference between an electric and a gas golf cart?",
    a: "Electric carts are quiet, need no fuel, and cost roughly $0.50–$1.50 to fully charge; lithium packs last 8–10 years and charge in 3–5 hours. Gas carts offer longer continuous range and instant refueling, which suits large properties, hunting and hilly terrain. For neighborhood, resort and beach driving, electric — especially lithium — is the more common choice.",
    topic: "buying",
  },
  {
    q: "What makes a golf cart street legal?",
    a: "A street legal golf cart, classified as a Low Speed Vehicle (LSV), must reach 20–25 mph and carry headlights, tail and brake lights, turn signals, reflectors, a horn, mirrors, seat belts, a windshield, a VIN and a parking brake. Titling, registration and insurance requirements vary by state. Memorial Day Golf Carts sells LSV-equipped carts and can outfit an existing cart to LSV specification.",
    topic: "street-legal",
  },
  {
    q: "How long does a lithium golf cart battery last?",
    a: "A lithium (LiFePO4) golf cart battery pack typically lasts 8–10 years or 3,000–5,000 charge cycles, compared with 4–6 years for lead-acid batteries. Lithium packs need no watering, weigh far less, charge faster, and hold voltage to the end of the discharge, so the cart does not slow down as the pack drains.",
    topic: "batteries",
  },
  {
    q: "Do you deliver golf carts?",
    a: "Yes. We deliver locally and ship nationwide. Delivery is quoted per order based on your address and the cart, so call 844-456-2228 with your ZIP code for a firm number. With 15 locations across Pennsylvania, New Jersey, Delaware, Virginia, North Carolina, South Carolina, Florida, Indiana, Ohio and Texas, most customers are within delivery range of a store.",
    topic: "delivery",
  },
  {
    q: "Can I trade in my old golf cart during the sale?",
    a: "Yes. Trade-ins are welcomed and appraised the same day during the Memorial Day event, on any make and in any condition. Bring the cart to any location or send photos and the serial number to get a trade value before you arrive.",
    topic: "trade-in",
  },
  {
    q: "What golf cart brands do you carry?",
    a: "Inventory rotates daily and typically includes Denago, Evolution, Club Car, E-Z-GO, Yamaha, ICON, Advanced EV and Bintelli, plus custom-built and refurbished carts. The brands page on this site lists every make currently in stock with live counts.",
    topic: "brands",
  },
  {
    q: "How many passengers can a golf cart carry?",
    a: "Standard carts seat 2 or 4 passengers. Extended-frame models seat 6, and limousine-style carts seat 8. Six-passenger carts are the most popular choice for beach towns and golf communities during the Memorial Day event because rear seats can flip to a cargo deck.",
    topic: "buying",
  },
  {
    q: "Is a used golf cart a good buy?",
    a: "A used golf cart from a dealer is a strong value when the battery pack, controller and charger have been inspected and the cart carries a warranty. Memorial Day Golf Carts reconditions every used cart before it reaches the sales floor and lists the battery year and pack condition on each vehicle page.",
    topic: "buying",
  },
  {
    q: "What does a lifted golf cart add?",
    a: "A lift kit raises the cart 3–6 inches and allows 12–14 inch wheels with all-terrain tires. It adds ground clearance for sand, grass and gravel, improves the ride over uneven ground, and is the standard configuration for beach and rural buyers. Lifted carts can be filtered directly in the inventory search on this site.",
    topic: "buying",
  },
  {
    q: "How do I reach Memorial Day Golf Carts?",
    a: "Call 844-456-2228 or use the contact form on this site. Every location is open Monday through Saturday, 9:00 AM to 5:00 PM, and closed on Sunday.",
    topic: "contact",
  },
  {
    q: "How often is inventory on this site updated?",
    a: "The full inventory is pulled from our dealer management system every day at 1:30 AM Eastern, so prices, photos, specifications and availability on this site reflect the live dealership stock each morning.",
    topic: "inventory",
  },
];

export default faq;
