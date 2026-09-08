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
