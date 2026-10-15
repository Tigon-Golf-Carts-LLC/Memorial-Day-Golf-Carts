/**
 * The TIGON IOT lead form ("Webhook Flows").
 *
 * Every lead form on the site — the contact page, trade-in, financing, the
 * inline form on each vehicle page and the modal on every page — renders
 * through `leadForm()`, so they all carry the same field names, the hidden
 * tracking fields and the spam trap. src/client/lead-form.ts fills the
 * tracking fields, validates and posts the form.
 *
 * The webhook key is NOT committed: the repository is public. It is read from
 * the TIGON_WEBHOOK_KEY environment variable at build time (a GitHub Actions
 * secret in the deploy workflow). The site is static, so the browser posts
 * straight to the webhook and the key necessarily appears in the deployed
 * HTML — that is expected for a browser-posted form. No signing secret is ever
 * used here; signatures are optional for this webhook.
 *
 * With no key configured the forms degrade to a call / email block rather than
 * shipping a form that cannot deliver.
 */

import { site } from "../../src/config/site.ts";
import { esc } from "./util.ts";

const WEBHOOK_KEY = (process.env.TIGON_WEBHOOK_KEY || "").trim();
if (WEBHOOK_KEY && !/^[A-Za-z0-9_-]+$/.test(WEBHOOK_KEY)) {
  throw new Error("TIGON_WEBHOOK_KEY must be the bare webhook key, e.g. the part after /hooks/");
}

/** The webhook endpoint, or "" when no key is configured. */
export const LEAD_ENDPOINT = WEBHOOK_KEY ? `https://tigoniot.com/hooks/${WEBHOOK_KEY}` : "";

/** The value TIGON IOT expects in `form_name` for this webhook. */
export const LEAD_FORM_NAME = "Contact form";

if (!LEAD_ENDPOINT) {
  process.stderr.write(
    "\n  warning: TIGON_WEBHOOK_KEY is not set — lead forms render as a call/email fallback.\n\n",
  );
}

/** The cart a form is about. Pre-filled read-only so the lead names the cart. */
export interface LeadCart {
  brand?: string;
  model?: string;
  vin?: string;
  sku?: string;
  /** Human label shown above the form, e.g. "2023 Epic E60L Light Blue". */
  label?: string;
}

const TRACKING_FIELDS = [
  "url", "referrer",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "fbclid", "ga_client_id",
];

const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif";

function fallback(id: string, heading: string, subject: string): string {
  return `<div class="form-fallback" data-testid="form-fallback-${esc(id)}">
  ${heading ? `<h3>${esc(heading)}</h3>` : ""}
  <p>The quickest route is the phone — someone answers it ${esc(site.hoursSummary.toLowerCase())}</p>
  <p>
    <a class="btn btn--primary btn--lg" href="${esc(site.phoneTel)}">Call ${esc(site.phone)}</a>
    <a class="btn btn--outline btn--lg" href="mailto:${esc(site.email)}?subject=${esc(subject)}">Email ${esc(site.email)}</a>
  </p>
</div>`;
}

export function leadForm(options: {
  /** Unique per page: prefixes every element id. */
  id: string;
  heading?: string;
  intro?: string;
  submitLabel?: string;
  messagePlaceholder?: string;
  cart?: LeadCart;
  /** Fallback mailto subject when no webhook is configured. */
  subject?: string;
}): string {
  const id = options.id;
  if (!LEAD_ENDPOINT) {
    return fallback(id, options.heading ?? "", options.subject ?? `Website enquiry — ${site.domain}`);
  }

  const cart = options.cart;
  const fid = (name: string) => `${id}-${name}`;

  const input = (o: {
    name: string; label: string; type?: string; required?: boolean; half?: boolean;
    autocomplete?: string; inputmode?: string; value?: string; readonly?: boolean; placeholder?: string;
  }) => `    <label class="lead-form__field${o.half ? " lead-form__field--half" : ""}" for="${esc(fid(o.name))}">
      <span>${esc(o.label)}${o.required ? ' <abbr title="required">*</abbr>' : ""}</span>
      <input id="${esc(fid(o.name))}" type="${esc(o.type ?? "text")}" name="${esc(o.name)}"` +
    `${o.required ? " required" : ""}` +
    `${o.autocomplete ? ` autocomplete="${esc(o.autocomplete)}"` : ""}` +
    `${o.inputmode ? ` inputmode="${esc(o.inputmode)}"` : ""}` +
    `${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ""}` +
    `${o.value ? ` value="${esc(o.value)}"` : ""}` +
    `${o.readonly ? " readonly" : ""}` +
    ` data-testid="input-${esc(fid(o.name))}">
    </label>`;

  const locked = Boolean(cart);
  const photo = (n: number) => `      <label class="lead-form__field" for="${esc(fid(`image_${n}`))}">
        <span>Photo ${n}</span>
        <input id="${esc(fid(`image_${n}`))}" type="file" name="image_${n}" accept="${IMAGE_ACCEPT}">
      </label>`;

  return `<form class="lead-form" id="${esc(id)}" action="${esc(LEAD_ENDPOINT)}" method="post" enctype="multipart/form-data" novalidate data-lead-form data-testid="form-${esc(id)}">
  ${options.heading ? `<h3>${esc(options.heading)}</h3>` : ""}
  ${options.intro ? `<p class="lead-form__intro">${esc(options.intro)}</p>` : ""}
  <p class="lead-form__about" data-lead-about${cart?.label ? "" : " hidden"}>${cart?.label ? `Asking about: <strong>${esc(cart.label)}</strong>` : ""}</p>
  <div class="lead-form__grid">
${input({ name: "first_name", label: "First name", required: true, half: true, autocomplete: "given-name" })}
${input({ name: "last_name", label: "Last name", required: true, half: true, autocomplete: "family-name" })}
${input({ name: "email", label: "Email", type: "email", required: true, half: true, autocomplete: "email" })}
${input({ name: "phone1", label: "Phone", type: "tel", required: true, half: true, autocomplete: "tel" })}
${input({ name: "phone2", label: "Alternate phone", type: "tel", half: true })}
${input({ name: "zip_code", label: "ZIP code", half: true, autocomplete: "postal-code", inputmode: "numeric" })}
${input({ name: "address", label: "Address", autocomplete: "street-address" })}
${input({ name: "brand", label: "Brand", half: true, value: cart?.brand, readonly: locked && Boolean(cart?.brand), placeholder: locked ? "" : "e.g. TIGON, Evolution, Epic" })}
${input({ name: "model", label: "Model", half: true, value: cart?.model, readonly: locked && Boolean(cart?.model), placeholder: locked ? "" : "Model you are interested in" })}
${input({ name: "vin_number", label: "VIN (optional)", half: true, value: cart?.vin, readonly: locked && Boolean(cart?.vin) })}
${input({ name: "sku_number", label: "Stock # / SKU (optional)", half: true, value: cart?.sku, readonly: locked && Boolean(cart?.sku) })}
    <label class="lead-form__field" for="${esc(fid("comments"))}">
      <span>Message</span>
      <textarea id="${esc(fid("comments"))}" name="comments" rows="4" placeholder="${esc(options.messagePlaceholder ?? "How can we help?")}" data-testid="input-${esc(fid("comments"))}"></textarea>
    </label>
    <fieldset class="lead-form__photos">
      <legend>Photos (optional) — up to 10 MB each: jpg, png, gif, webp or heic</legend>
${photo(1)}
${photo(2)}
${photo(3)}
    </fieldset>
  </div>
  <div class="lead-form__hp" aria-hidden="true">
    <label for="${esc(fid("website"))}">Leave this field empty</label>
    <input type="text" id="${esc(fid("website"))}" name="website" tabindex="-1" autocomplete="off" value="">
  </div>
  <input type="hidden" name="form_name" value="${esc(LEAD_FORM_NAME)}">
${TRACKING_FIELDS.map((name) => `  <input type="hidden" name="${name}" value="">`).join("\n")}
  <button class="btn btn--primary btn--lg lead-form__submit" type="submit" data-testid="button-submit-${esc(id)}">${esc(options.submitLabel ?? "Send")}</button>
  <p class="lead-form__status" role="status" aria-live="polite" data-lead-status></p>
  <p class="note">Or call <a href="${esc(site.phoneTel)}">${esc(site.phone)}</a> — ${esc(site.hoursSummary.toLowerCase())}</p>
</form>`;
}

/** Attributes that make any button open the modal, optionally about a cart. */
export function leadOpenAttrs(cart?: LeadCart): string {
  if (!cart) return "data-lead-open";
  const attr = (name: string, value?: string) => (value ? ` data-lead-${name}="${esc(value)}"` : "");
  return `data-lead-open${attr("brand", cart.brand)}${attr("model", cart.model)}${attr("vin", cart.vin)}${attr("sku", cart.sku)}${attr("label", cart.label)}`;
}

/** The site-wide lead modal, rendered once per page by the layout. */
export function leadModal(): string {
  return `<dialog class="lead-modal" id="lead-modal" aria-labelledby="lead-modal-title" data-lead-modal data-testid="dialog-lead">
  <div class="lead-modal__inner">
    <button class="lead-modal__close" type="button" data-lead-close aria-label="Close">&times;</button>
    <h2 id="lead-modal-title">Get a quote or ask a question</h2>
    <p class="lead-modal__lede">Or call <a href="${esc(site.phoneTel)}" data-testid="link-modal-phone">${esc(site.phone)}</a> now — a specialist can check every location while you are on the phone.</p>
${leadForm({ id: "lead-modal-form", submitLabel: "Send my request" })}
  </div>
</dialog>`;
}
