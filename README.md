# Memorial Day Golf Carts

The Memorial Day Golf Cart Sales Event — [memorialdaygolfcarts.com](https://memorialdaygolfcarts.com)

A fully static site: 401 prerendered pages built from a build-time snapshot of the
live Tigon DMS inventory feed. No server, no same-origin API, no database.
Deployed to GitHub Pages by `.github/workflows/deploy.yml`.

## How it works

```
DMS (api.tigondms.com)
        │  script/fetch-data.ts      normalize + snapshot
        ▼
src/data/snapshot.json               build-time input (committed)
public/data/inventory-index.json     runtime input for client filtering
        │
        ├─ script/generate-seo.ts    sitemap.xml, robots.txt, llms.txt, CNAME, .nojekyll
        ├─ script/optimize-assets.ts S3 photos -> WebP/AVIF at responsive widths
        ├─ vite build                bundles + hashes the CSS and two client modules
        └─ script/prerender.ts       one real index.html per route
                                     ▼
                                   dist/
```

Filtering runs entirely client-side over the snapshot. The URL query string is
the single source of truth for every filter, the sort order and the page number;
component state is derived from it and never the reverse.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Build from the committed snapshot and serve on :5000 |
| `npm run build` | fetch-data → generate-seo → optimize-assets → vite build → prerender |
| `npm run build:site` | Same, skipping the network fetch (uses the committed snapshot) |
| `npm run preview` | Serve `dist/` the way a static host does |
| `npm test` | Filter unit tests + browser tests (53 tests) |
| `npm run budget` | Size table, 20 largest files, budget gate |
| `npm run verify` | 52 checks against the built output |

Useful flags:

```bash
node script/fetch-data.ts --require-live      # fail rather than use a stale snapshot
node script/fetch-data.ts --fixture           # normalize the offline fixture, no network
node script/optimize-assets.ts --skip-carts   # site assets only
node script/optimize-assets.ts --limit 40     # first 40 carts, for fast iteration
node script/optimize-assets.ts --keep-originals
```

## Configuration

Everything about the business lives in `src/config/site.ts` — name, phone,
email, hours, socials, keyword strategy. The phone number there is rendered as
visible text, as the `tel:` href and as `telephone` in the JSON-LD, so changing
it in one place changes it everywhere.

Two environment variables control deployment, both set in the workflow's `env`
block:

- `SITE_DOMAIN` — the bare domain, used for canonicals and the sitemap.
- `BASE_PATH` — `/` for a custom domain or `<user>.github.io`;
  `/<repo-name>/` for a project site.

## Lead forms (TIGON IOT Webhook Flows)

Every lead form posts straight from the browser to this site's TIGON IOT
webhook as `multipart/form-data`. There is no server, so there is no request
signing (signatures are optional for this webhook) and no signing secret is
ever used anywhere in this repository.

| Where | What |
| --- | --- |
| Every page | "Get a Quote" (header), "Message us" (mobile bar), "Send us a message" (CTA band) open one site-wide modal form |
| Inventory cards | "Ask" opens the modal pre-filled with that cart's brand, model, VIN and stock # (read-only) |
| `/golfcart/*/` | Call + Apply for financing buttons, then an inline form pre-filled with the cart |
| `/contact/`, `/trade-in/`, `/financing/` | Inline form |

- `script/lib/lead-form.ts` renders the markup (all field names, hidden
  `form_name="Contact form"`, tracking fields, the `website` spam trap).
- `src/client/lead-form.ts` (bundled into every page) stores first-touch
  UTMs / gclid / fbclid for 30 days, fills `url`, `referrer`, `ga_client_id`,
  validates, posts, and shows the thank-you / error / 429 message.

**The webhook key is not committed — this repository is public.** It is read
from `TIGON_WEBHOOK_KEY` at build time. Add it once in GitHub: *Settings →
Secrets and variables → Actions → New repository secret*, name
`TIGON_WEBHOOK_KEY`, value = the key (the part after `/hooks/`). The deploy
workflow passes it to the prerender step. Without it the forms render as a
call / email fallback and the deploy logs a warning. CI builds use a dummy key
and the browser tests intercept every POST, so tests never send a real lead.

## Requirements

Node 22.6 or newer. The build scripts are TypeScript run directly by Node's
native type stripping, so there is no compile step — but Node 20 cannot do this.

## Layout

```
script/                 build pipeline (fetch-data, generate-seo, optimize-assets, prerender)
script/lib/             layout, components, schema, images, routes, DMS client
script/pages/           one renderer per page type
src/config/             site config, locations, guides, FAQ, testimonials
src/data/               committed snapshot + image manifest
src/lib/                filters.ts, normalize.ts, photo-path.ts (shared with the client)
src/client/             the two browser modules
src/styles/site.css     the whole stylesheet, no webfont
tests/                  filter unit tests + Playwright browser tests
assets-raw/             offline DMS fixture; raw photo originals when retained
```
