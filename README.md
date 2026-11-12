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
| `npm test` | Filter unit tests + browser tests (74 tests) |
| `npm run budget` | Size table, 20 largest files, budget gate |
| `npm run verify` | 54 checks against the built output |

Useful flags:

```bash
node script/fetch-data.ts --require-live      # fail rather than use a stale snapshot
node script/fetch-data.ts --fixture           # normalize the offline fixture, no network
node script/optimize-assets.ts --skip-carts   # site assets only
node script/optimize-assets.ts --limit 40     # first 40 carts, for fast iteration
node script/optimize-assets.ts --keep-originals
```

## Inventory sources

`script/fetch-data.ts` pulls from the **DMS** first
(`https://api.tigondms.com/wp-website`, no key). If that fails or yields
nothing publishable, it pulls from **TIGON IOT**
(`https://tigoniot.com/wp-website`), which serves a daily copy of the DMS feed
over the same paths. IOT needs the `IOT_API_KEY` repository secret. The key is
sent only as the `x-api-key` header and never logged. A snapshot always comes
from exactly one source. If both fail, the previous snapshot stays.

A cart is shown only if it is in stock, ready for sale (`rfsStatus.isRFS`), not
boneyard / work-in-progress / service, priced above $0, and has at least one
real photograph. Photos are served from TIGON's public S3 bucket.

**Relaxed mode** is a one-time recovery switch. Enable it with `--relaxed`, the
`relaxed` input on a manual deploy run, or `INVENTORY_RELAXED_UNTIL=<Eastern
date>`. In relaxed mode a later page failing keeps the pages already received,
and `isRFS` is not required. The stock, price and photo rules still apply. The
deploy workflow sets `INVENTORY_RELAXED_UNTIL`, so it switches itself off after
that date.

Each deploy run writes the source, counts and any errors to its run summary
page on GitHub.

### Daily schedule

`script/lib/schedule.ts` decides on every deploy run whether to pull:

| When (Eastern) | What runs |
| --- | --- |
| 12–1 AM, 1–2 AM | DMS. If it fails, wait for the next hourly run |
| 2–3 AM (3rd attempt) | DMS, then IOT straight away if the DMS fails |
| Later in the window | IOT. There is never a 4th DMS attempt, and none starts with under 15 min left |
| 5 AM onward, no pull yet today | IOT recovery |
| Already pulled today | Nothing. The build reuses the saved snapshot |

The 5:00 AM cutoff is checked before every DMS request, and a request's timeout
never runs past it. A successful pull is committed back to `main`, so it
survives the next build. A pull whose displayed count drops by more than 30% is
held back unless the other source confirms it within 5%. The cron runs hourly
from 04:00 to 07:00 UTC, plus three daytime checks. Attempt numbers come from
the real time since midnight ET, so DST (including November's repeated 1 AM)
needs no cron change. `tests/schedule.test.ts` covers these rules.

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
| Every page | "Get a Quote" (header), "Send Us a Message" (contact bubble), "Send us a message" (CTA band) open one site-wide modal form |
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

## Contact widget and DMS chat

Every page has one floating contact bubble, bottom-right
(`contactWidget()` in `script/lib/layout.ts`, behaviour in
`src/client/contact-widget.ts`). It expands into three options:

| Option | Action |
| --- | --- |
| Send Us a Message | Opens the site-wide lead-form modal (same `data-lead-open` hook as "Get a Quote") |
| Direct Message | Opens the Tigon DMS chat plugin |
| Call Now | `tel:` link built from `site.phoneTel` |

The DMS chat plugin is loaded on every page with the vendor's embed snippet,
placed just before `</body>`:

```html
<script async src="https://s3.amazonaws.com/prod.docs.s3/assets/chat-plugin/chat-plugin.js"></script>
```

It renders into an open shadow root (`#chat-plugin-host`). The widget injects a
stylesheet there that hides the plugin's own launcher bubble and callout, opens
and closes the chat through the plugin's own controls, and mirrors its unread
badge onto the contact bubble. If the plugin cannot load, "Direct Message"
falls back to the contact form. The browser tests serve a stand-in for the
plugin, so they never reach the DMS.

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
