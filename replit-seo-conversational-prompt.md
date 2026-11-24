# Replit Prompt: Conversational, Answer-First SEO Conversion (Any Website)

Copy everything below the line into Replit's agent. It works on any website: the agent first discovers how your site is built and what it's about, then adapts.

---

You are working on this website's codebase. Your job: convert every indexable page into a conversational, answer-first format that serves both informational and purchase-intent searchers and is easy for Google Search and its AI Overviews/AI Mode to understand, retrieve and cite.

We are writing for three goals at once:

- **Informational intent:** answer the questions people ask while researching.
- **Purchase intent:** help people who are ready to compare, choose and buy make a confident decision.
- **Product information and product authority:** make this site the most complete, accurate and trustworthy source for the products or services it sells.

Follow Google's own guidance: good content for people comes first. No "AEO/GEO hacks."

## STEP 0: Discover the site before you write (no edits yet)

1. **Figure out how the site is built:** framework or static generator, where page content lives (templates, components, Markdown, CMS data, config files, databases), how pages and URLs are generated, how titles/meta descriptions/structured data are set, and the build, test and preview commands.
2. **Figure out what the site is about:** the business or publisher, its audience, its products or services, locations, and any real data the site already has (catalog, inventory, prices, specs, case studies, reviews, team bios).
3. **List every indexable page and group them by page type** (e.g. home, pillar/category pages, product or service pages, location pages, blog/guide articles, FAQ, about, contact, listing/pagination pages, legal pages).

4. **Tag each page type by its main search intent:** informational (learn), commercial investigation (compare, "best," "vs," reviews), transactional (buy, price, availability, quote), or local (near me, hours, directions).

Then give me a short **AUDIT TABLE**: page type | number of URLs | main intent | does it answer the core question in the first 1–2 sentences? | headings phrased as real questions? | thin or duplicate? | internal links in and out | proposed change.

Then give me a **PLAN** grouped by page type. **WAIT for my approval before bulk edits.**

## STEP 1: The conversational page pattern (apply to each page type)

For each page, work out the ONE core question the searcher has and what they want: a quick definition, a comparison, step-by-step instructions, or a specific solution (buy, book, sign up, get a quote, find a location). Build the page around that need:

1. **Title + H1 + first paragraph** include the main topic in plain language. The H1 can be the question itself or a clear statement of it.
2. **Answer first.** The opening 1–3 sentences directly answer the core question with concrete specifics (price or price range, what's included, where, how long, who it's for). No backstory before the answer. If the site already has a summary or intro field, reuse and improve it. Don't build a second system.
3. **Question-cluster sections.** Use H2s phrased the way people really ask. Cover the natural follow-up questions a visitor has next (the "fan-out"): cost, comparisons between options, how it works, how long it takes, requirements, eligibility, warranty or guarantees, delivery or availability, next steps. Under each H2:
   - First sentence = the direct answer.
   - Then short paragraphs, bullets, or a small comparison table for detail.
   - Use H3s for sub-questions.
4. **Entities, not repetition.** Name and explain the related concepts naturally: the brands, products, services, standards, methods, places and terms that belong to this topic. Use synonyms and natural variations. NO keyword stuffing, NO repeating the exact phrase. Never repeat a keyword list in the copy.
5. **Scannable.** Short paragraphs (2–4 sentences), bullets, tables where comparing, clear visual hierarchy, mobile-first.
6. **Next step.** End each section cluster with a relevant internal link or CTA. Use descriptive anchor text, never "click here."

## STEP 2: Non-commodity content (most important)

Generic "7 tips for X" content adds nothing. Make each page something only this business or author could write:

- **Use real data** the site already has (product catalog, inventory, pricing, specs, locations, results). Where possible, compute numbers in code at build or render time so they stay accurate. Never hard-code numbers that will go stale.
- **First-hand experience:** where a page would benefit from real insight (lessons learned, what customers commonly get wrong, why we recommend X over Y, real examples, original photos or data), insert a clearly marked placeholder: `[OWNER INPUT NEEDED: <specific question for me>]`. List all placeholders for me at the end.
- **DO NOT invent** testimonials, reviews, statistics, awards, credentials, years in business, guarantees, prices, laws, case studies, or customer stories. Use only what already exists in the codebase/content or what I give you.
- **Cite credible sources** for factual, legal, medical, financial, technical or regulatory claims: official regulations, government sites, manufacturers, standards bodies, peer-reviewed research. Use visible links with clear attribution.
- **Images and video:** keep using real, relevant images. Give every image descriptive alt text. Add captions where they help. Suggest where original photos, diagrams or short videos would add value.

## STEP 2B: Purchase intent, product information and product authority

Purchase-intent searchers want to decide and act. Give them everything they need on the page, so they don't have to leave to find it.

**Match the purchase questions people ask:**

- "How much does X cost?" / "X price": show the real price or price range, what affects price, and what's included.
- "X vs Y" / "which X should I buy": an honest side-by-side comparison table, with who each option is best for.
- "Best X for [use case]": recommendations tied to a specific need, with the reason for each pick.
- "Is X worth it?" / "X review": real pros AND cons, and who should NOT buy it.
- "X for sale" / "buy X" / "X near me": in-stock availability, location, delivery or shipping, and a clear buy/quote/contact action.
- "X financing / warranty / returns": the real terms, stated plainly.

**Complete product information on every product page** (only from real data; hide any field that's missing, never guess):

- Name, brand/manufacturer, model, variant (size, color, configuration)
- Price, currency, availability (in stock, preorder, sold out), condition (new/used/refurbished)
- Full specifications in a real `<table>` (dimensions, capacity, performance, materials, compatibility, etc.)
- What's included in the box or the service
- Shipping/delivery options, cost and timing; return policy; warranty terms
- Identifiers where they exist (SKU, MPN, GTIN/UPC, VIN, model number)
- Multiple real photos (different angles, in use, scale), with descriptive alt text; video where available
- A clear primary call to action (buy, add to cart, get a quote, book, call)

**Product authority (why trust this site about this product):**

- Show first-hand expertise: hands-on use, testing, installation, servicing, or selling this product. Say how you know, and mark it `[OWNER INPUT NEEDED]` where only the owner can supply it.
- Follow Google's guidance for high-quality product reviews: evaluate from a user's perspective, show evidence of real experience (original photos, measurements, test results), explain what sets the product apart from competitors, cover benefits and drawbacks, and compare to alternatives.
- Explain the "why" behind recommendations, not just the "what."
- Cite the manufacturer's official specs and any relevant standards, certifications or regulations.
- Show real customer reviews and ratings only if they are genuine and already collected. Never write or paraphrase fake ones.
- Name a real author or team on buying guides and reviews, with their relevant experience.
- Link product pages to the buying guides, comparisons and FAQs that support them, and link those back to the products. Product authority comes from the whole cluster, not one page.

**Structured data for products** (accurate and matching what's visible): `Product` with `Offer` (price, priceCurrency, availability, itemCondition, url), `brand`, identifiers (`sku`, `mpn`, `gtin`), `image`; `AggregateRating`/`Review` only for genuine reviews shown on the page; shipping and return-policy details where supported. If the business sells online, recommend keeping product data consistent with Google Merchant Center.

## STEP 3: Topical hubs and internal linking

Build hub-and-spoke clusters from the existing pages. Do NOT create a new page for every query variation.

- **Pillar pages** cover a broad topic and link out to every subtopic page.
- **Subtopic pages** answer one real question in depth and link back to the pillar and across to closely related pages.
- **FAQ:** keep one central FAQ page, and on other pages show only the questions relevant to that page.
- Add a "Related questions" block near the bottom of hub and article pages that links to the pages that answer them.
- If two pages target the same intent, merge them (keep one canonical, redirect or canonicalize the other) instead of keeping thin duplicates.
- New pages are allowed ONLY where there is a real, distinct visitor question with no existing page AND I can add first-hand input. Propose them as a list. Don't create them unasked.

> **Warning:** mass-producing near-duplicate pages for keyword or fan-out variations violates Google's scaled content abuse spam policy. Quality over quantity.

## STEP 4: Page-type rules

- **Home page:** answer-first "who you are, what you offer, who it's for, where" + question clusters + links into the main hubs.
- **Product / service / item pages:** if there are many generated from data, avoid boilerplate. Lead with a 1–2 sentence summary generated from THAT item's real data. Add a short Q&A block generated ONLY from fields that exist for that item. Hide questions whose data is missing. Don't write fake answers.
- **Comparison, "best X," buying guide and review pages:** commercial-investigation intent. Lead with the verdict (which to choose and for whom), then a comparison table, then the reasoning, pros/cons and evidence. Link every product mentioned to its product page.
- **Category / listing / filter pages:** keep them lean. Add a short, data-driven answer intro on the first page only. Leave pagination pages as-is, with self-referencing canonicals.
- **Location pages:** answer "where is it, hours, what's offered here, service area," using real location data.
- **Articles / guides:** one core question per article, answered in the first lines, then the question cluster, with a clear author and real expertise shown.
- **About page:** real experience, people and credentials (owner input placeholders, nothing invented).
- **Contact, financing, pricing, policy-type pages:** answer-first + question clusters.
- **Legal pages, 404, HTML sitemap:** don't touch.

## STEP 5: Technical rules (do not break these)

- Main content must be in the HTML that search engines receive (server-rendered or prerendered), not injected only by client-side JavaScript. If the site is a client-only single-page app, flag it and propose a fix.
- Use semantic HTML: one `<h1>`, logical `<h2>`/`<h3>`, `<main>`, `<article>`, `<section>`, `<nav>`, real `<table>` for comparisons. `<details>`/`<summary>` is fine for FAQ, but the answer text must be in the HTML.
- **Structured data:** keep it accurate and matching visible content (e.g. Organization/LocalBusiness, Product/Offer, Article, BreadcrumbList; see STEP 2B for products). FAQPage markup may stay where real Q&A is visible, but don't expect FAQ rich results (Google limits them to authoritative government/health sites). Don't add schema just for AI. It isn't required.
- **llms.txt and other "AI files":** not needed for Google Search, which ignores them. Leave any existing one as-is; don't create one just for Google.
- **Don't change** canonicals, domain/base-path handling, business contact info sources, forms, analytics, or URL structure without my approval. Any URL change needs a redirect.
- Only update last-modified dates when the content actually changes. No fake freshness.
- Keep pages fast and mobile-friendly. Don't add heavy scripts or unoptimized images.
- No hidden text, no doorway pages, no auto-generated filler paragraphs.

## STEP 6: Work in batches and verify

Order:

1. Shared components (answer block, question-section component, related-questions block)
2. Home + pillar/hub pages
3. FAQ + articles/guides
4. Category pages
5. Location pages
6. About, contact, pricing and other content pages
7. Product/service/item templates

After each batch, run the project's own build, test and lint commands (and any SEO or link checks it has). Fix anything that fails. Then show me before/after for one example page of that type (H1, first paragraph, list of H2 questions).

## Final deliverables

1. Summary of every file changed and why.
2. A table: page type | main intent | core question | answer-first sentence | H2 question cluster.
3. A product-information gap report: for each product page type, which fields (price, availability, specs, identifiers, photos, shipping, returns, warranty, reviews) are present, missing, or need owner input.
4. Every `[OWNER INPUT NEEDED]` placeholder, with the exact question I need to answer.
5. Proposed new pages (if any), each with the distinct visitor question it answers.
6. A post-launch checklist: request indexing for key pages in Google Search Console, confirm the site is included in generative AI features in Search Console, monitor the Generative AI performance report, and check pages with the URL Inspection tool to confirm the rendered HTML contains the content.

Self-check every page against two questions: **"Would a real visitor find this page satisfying and trustworthy?"** and, for purchase-intent pages, **"Does this page give a buyer everything they need to decide and act?"** If not, fix it before moving on.
