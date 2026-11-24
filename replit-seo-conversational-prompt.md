# Replit Prompt: Conversational, Answer-First SEO Conversion

Copy everything below the line into Replit's agent.

---

You are working on memorialdaygolfcarts.com, a static TypeScript site (Vite + custom prerender) that sells golf carts from a build-time snapshot of the TIGON DMS inventory feed. Your job: convert every indexable page into a conversational, answer-first format that serves informational and high-intent searchers and is easy for Google Search and its AI Overviews/AI Mode to understand, retrieve and cite.

Follow Google's own guidance: good content for people comes first. No "AEO/GEO hacks."

## STEP 0: Read before you write (no edits yet)

Read these files and summarize what each page type currently renders:

- `README.md` (build pipeline, commands)
- `src/config/site.ts` (business info, keyword strategy)
- `src/config/faq.ts`, `src/config/guides.ts`, `src/config/locations.ts`, `src/config/testimonials.ts`
- `script/lib/routes.ts` (per-route title, description, answer-first `answer` field, faqTopics)
- `script/lib/route-table.ts` (every route: home, pillar `/golf-carts-for-sale/`, event page, inventory filters + pagination, `/golfcart/<slug>/` vehicle pages, `/brands/`, brand + model pages, `/locations/` + each store + store inventory, `/guides/` + each guide, `/financing/`, `/trade-in/`, `/delivery/`, `/service/`, `/about/`, `/contact/`, `/faq/`)
- `script/pages/*.ts` (how each page type is rendered)
- `script/lib/schema.ts` (JSON-LD), `script/lib/layout.ts`, `script/lib/components.ts`
- `script/generate-seo.ts` (sitemap, robots, llms.txt)

Then give me a short **AUDIT TABLE**: page type | number of URLs | does it answer the core question in the first 1–2 sentences? | headings phrased as real questions? | thin or duplicate? | internal links in and out | proposed change.

Then give me a **PLAN** grouped by page type. **WAIT for my approval before bulk edits.**

## STEP 1: The conversational page pattern (apply to each page type)

For each page, work out the ONE core question the searcher has and what they want: a quick definition, a comparison, step-by-step instructions, or a specific solution (buy, finance, get delivery, find a store). Build the page around that need:

1. **Title + H1 + first paragraph** include the main topic in plain language. The H1 can be the question itself or a clear statement of it.
2. **Answer first.** The opening 1–3 sentences directly answer the core question with concrete specifics (price range, what's included, where, how long). No backstory before the answer. Reuse and improve the existing `answer` field in `routes.ts`. Don't build a second system.
3. **Question-cluster sections.** Use H2s phrased the way people really ask. Cover the natural follow-up questions a buyer has next (the "fan-out"), e.g. for golf carts for sale: How much does a new golf cart cost? Lithium vs. lead-acid, which should I buy? Are these carts street-legal (LSV)? Do you deliver, and how much? Can I finance or trade in? What's the warranty? Under each H2:
   - First sentence = the direct answer.
   - Then short paragraphs, bullets, or a small comparison table for detail.
   - Use H3s for sub-questions.
4. **Entities, not repetition.** Name and explain the related concepts naturally: brands and models actually in inventory, lithium/AGM/lead-acid batteries, LSV / street-legal requirements, seating (2/4/6 passenger, lifted, utility), range, top speed, warranty, delivery area, the TIGON store locations. Use synonyms and natural variations. NO keyword stuffing, NO repeating the exact phrase. Never repeat a keyword list in the copy.
5. **Scannable.** Short paragraphs (2–4 sentences), bullets, tables where comparing, clear visual hierarchy, mobile-first.
6. **Next step.** End each section cluster with a relevant internal link or CTA (view inventory, get a quote, financing, the nearest location). Use descriptive anchor text, never "click here."

## STEP 2: Non-commodity content (most important)

Generic "7 tips for buying a golf cart" content adds nothing. Make each page something only this dealer could write:

- **Use real data** from the snapshot (`src/data/snapshot.json` / `public/data/*.json`), computed at build time: number of carts in stock, real price ranges per brand/model/location, the most common battery type, seating mix, etc. Generate these numbers in code so they stay accurate on every build. Never hard-code numbers that will go stale.
- **First-hand experience:** where a page would benefit from a real dealer insight (e.g. "what we see customers regret," "why we recommend lithium for X," delivery stories, service lessons), insert a clearly marked placeholder: `[OWNER INPUT NEEDED: <specific question for me>]`. List all placeholders for me at the end.
- **DO NOT invent** testimonials, reviews, statistics, awards, years in business, warranty terms, prices, laws, or customer stories. Use only what exists in `src/config/*.ts`, the snapshot, or what I give you.
- **Cite credible sources:** for street-legal/LSV rules, cite the actual regulation (e.g. NHTSA FMVSS No. 500, 49 CFR 571.500) and note that state rules vary. For battery or manufacturer claims, cite the manufacturer. Use visible links with clear attribution.
- **Images:** keep using real cart photos. Give every image descriptive alt text that names the brand, model, color, and setting. Add captions where they help.

## STEP 3: Topical hubs and internal linking

Build hub-and-spoke clusters from the existing routes. Do NOT create a new page for every query variation.

- **Pillar:** `/golf-carts-for-sale/` → links to brands, guides, locations, financing, delivery, FAQ.
- **Brands hub** → each brand → each model → matching in-stock vehicle pages.
- **Locations hub** → each store → that store's inventory, delivery, service.
- **Guides hub** → each guide answers one real buyer question in depth and links to the matching inventory filters/brands.
- `/faq/` stays the central Q&A, and each page's on-page Q&A pulls only the relevant `faqTopics` (already supported).
- Add a "Related questions" block near the bottom of hub/guide pages that links to the pages that answer them.
- If two pages target the same intent, merge them (keep one canonical, redirect or canonicalize the other) instead of keeping thin duplicates.
- New guides are allowed ONLY where there is a real, distinct buyer question with no existing page AND I can add first-hand input. Propose them as a list. Don't create them unasked.

> **Warning:** mass-producing near-duplicate pages for keyword or fan-out variations violates Google's scaled content abuse spam policy. Quality over quantity.

## STEP 4: Page-type specific rules

- **Home + event page:** answer-first "what is the Memorial Day Golf Cart Sales Event, what's on sale, until when, where" + question clusters.
- **Vehicle pages (`/golfcart/<slug>/`):** there are hundreds, so avoid boilerplate. Lead with a 1–2 sentence summary generated from THAT cart's real data (year, brand, model, seats, battery, color, price, location). Add a short Q&A block generated ONLY from fields that exist for that cart (e.g. "Is this cart street-legal?" only if the data says so). Hide questions whose data is missing. Don't write fake answers.
- **Inventory filter + pagination pages:** keep them lean. Add a short data-driven answer intro on the first page only. Leave pagination pages (`/page/N/`) as-is, with self-referencing canonicals.
- **Brand/model pages:** answer "Is <brand> a good golf cart / what does it cost / what models are available," using real inventory data + cited manufacturer facts.
- **Location pages:** answer "Where is the store, hours, what's in stock here, do you deliver to <area>," using `src/config/locations.ts`.
- **Financing / trade-in / delivery / service / contact / about:** answer-first + question clusters. About = real company experience (owner input placeholders).
- **Legal pages, 404, sitemap page:** don't touch.

## STEP 5: Technical rules (do not break these)

- All content must be in the prerendered HTML (`script/prerender.ts` output), not injected only by client JS.
- Use semantic HTML: one `<h1>`, logical `<h2>`/`<h3>`, `<main>`, `<article>`, `<section>`, `<nav>`, real `<table>` for comparisons. `<details>`/`<summary>` is fine for FAQ, but the answer text must be in the HTML.
- **Structured data** (`script/lib/schema.ts`): keep it accurate and matching visible content. Keep Product/Offer, LocalBusiness/AutoDealer, BreadcrumbList, Article (guides). FAQPage markup may stay where real Q&A is visible, but don't expect FAQ rich results (Google limits them to authoritative government/health sites). Don't add schema just for AI. It isn't required.
- **llms.txt:** keep it as-is. Google Search ignores it; it neither helps nor hurts.
- **Don't change:** canonicals, `BASE_PATH`/`SITE_DOMAIN` handling, the phone/business info source (`src/config/site.ts`), lead forms, URL structure (no URL changes without redirects + my approval).
- Only update `lastmod`/`dateModified` when the content actually changes. No fake freshness.
- Keep the page-weight budget passing, and keep pages fast and mobile-friendly.
- No hidden text, no doorway pages, no auto-generated filler paragraphs.

## STEP 6: Work in batches and verify

Order:

1. Shared components (answer block, question-section component, related-questions block)
2. Pillar + home + event
3. FAQ + guides
4. Brands/models
5. Locations
6. Financing/trade-in/delivery/service/about/contact
7. Vehicle page template

After each batch run:

```bash
npm run build:site
npm test
npm run verify
npm run budget
```

Fix anything that fails. Then show me before/after for one example page of that type (H1, first paragraph, list of H2 questions).

## Final deliverables

1. Summary of every file changed and why.
2. A table: page type | core question | answer-first sentence | H2 question cluster.
3. Every `[OWNER INPUT NEEDED]` placeholder, with the exact question I need to answer.
4. Proposed new guides (if any), each with the distinct buyer question it answers.
5. A post-launch checklist: request indexing for key pages in Google Search Console, confirm the site is included in generative AI features in Search Console, monitor the Generative AI performance report, and check pages with the URL Inspection tool to confirm the rendered HTML contains the content.

Self-check every page against one question: **"Would a real golf cart shopper find this page satisfying and trustworthy?"** If not, fix it before moving on.
