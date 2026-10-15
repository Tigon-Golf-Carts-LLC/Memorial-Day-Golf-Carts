/**
 * TIGON IOT lead forms (Webhook Flows).
 *
 * Every `form[data-lead-form]` is posted from the browser as multipart
 * FormData to the endpoint in its `action` attribute. This module:
 *   - remembers first-touch utm_* / gclid / fbclid for 30 days (localStorage),
 *   - fills url, referrer, the tracking fields and ga_client_id before sending,
 *   - validates required fields, email, phone (10+ digits) and photos (<= 10 MB),
 *   - drives the site-wide modal opened by any `[data-lead-open]` button, which
 *     can carry the cart it is about as data-lead-brand/model/vin/sku/label.
 *
 * No signing secret ever lives here: signatures are optional for this webhook
 * and a browser cannot keep a secret.
 */

const FORM_NAME = "Contact form";
const HONEYPOT = "website";
const SUCCESS_TEXT = "Thank you! We received your message and will contact you shortly.";
const ERROR_TEXT = "Sorry, something went wrong. Please try again or call us.";
const RATE_LIMIT_TEXT = "Too many tries — please wait a minute and try again.";
const MAX_FILE_MB = 10;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
const TRACK = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"] as const;
const STORE_KEY = "tigon_first_touch";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------- tracking --- */

type Touch = Record<string, string>;

/** First-touch attribution: the first values seen are kept for 30 days. */
function firstTouch(): Touch {
  const current: Touch = {};
  let found = false;
  try {
    const query = new URLSearchParams(window.location.search);
    for (const key of TRACK) {
      const value = query.get(key);
      if (value) { current[key] = value; found = true; }
    }
  } catch { /* no URLSearchParams */ }

  let saved: { ts: number; v: Touch } | null = null;
  try { saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || "null"); } catch { saved = null; }
  if (saved && (!saved.ts || Date.now() - saved.ts > MAX_AGE_MS)) saved = null;
  if (!saved && found) {
    saved = { ts: Date.now(), v: current };
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch { /* private mode */ }
  }
  const out: Touch = {};
  for (const key of TRACK) out[key] = saved?.v?.[key] || current[key] || "";
  return out;
}

/** GA client id from the _ga cookie: GA1.1.123456.789012 -> 123456.789012 */
function gaClientId(): string {
  const match = document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/);
  if (!match) return "";
  const parts = decodeURIComponent(match[1]).split(".");
  return parts.length >= 4 ? parts.slice(-2).join(".") : "";
}

function tracking(): Touch {
  return {
    ...firstTouch(),
    url: window.location.href,
    referrer: document.referrer || "",
    ga_client_id: gaClientId(),
  };
}

function fillHidden(form: HTMLFormElement) {
  const values = tracking();
  for (const [key, value] of Object.entries(values)) {
    const el = form.querySelector<HTMLInputElement>(`input[type="hidden"][name="${key}"]`);
    if (el) el.value = value;
  }
  const name = form.querySelector<HTMLInputElement>('input[name="form_name"]');
  if (name && !name.value) name.value = FORM_NAME;
}

/* ----------------------------------------------------------- validation --- */

function field(form: HTMLFormElement, name: string) {
  return form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
}

function setError(input: HTMLInputElement | HTMLTextAreaElement, message: string) {
  const label = input.closest(".lead-form__field");
  let note = label?.querySelector<HTMLElement>(".lead-form__error");
  if (!message) {
    input.removeAttribute("aria-invalid");
    note?.remove();
    return;
  }
  input.setAttribute("aria-invalid", "true");
  if (!note && label) {
    note = document.createElement("span");
    note.className = "lead-form__error";
    note.id = `${input.id}-error`;
    label.appendChild(note);
    input.setAttribute("aria-describedby", note.id);
  }
  if (note) note.textContent = message;
}

/** Returns the first invalid input, or null when the form is good to send. */
function validate(form: HTMLFormElement): HTMLInputElement | HTMLTextAreaElement | null {
  let first: HTMLInputElement | HTMLTextAreaElement | null = null;
  const fail = (input: HTMLInputElement | HTMLTextAreaElement, message: string) => {
    setError(input, message);
    if (!first) first = input;
  };

  const required: Array<[string, string]> = [
    ["first_name", "Please enter your first name."],
    ["last_name", "Please enter your last name."],
    ["email", "Please enter your email address."],
    ["phone1", "Please enter your phone number."],
  ];
  for (const [name, message] of required) {
    const input = field(form, name);
    if (!input) continue;
    setError(input, "");
    if (!input.value.trim()) fail(input, message);
  }

  const email = field(form, "email");
  if (email && email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) {
    fail(email, "Please enter a valid email address, like name@example.com.");
  }
  for (const name of ["phone1", "phone2"]) {
    const phone = field(form, name);
    if (!phone) continue;
    if (name === "phone2") setError(phone, "");
    if (!phone.value.trim()) continue;
    if (phone.value.replace(/\D/g, "").length < 10) fail(phone, "Please enter a phone number with at least 10 digits.");
  }

  form.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => {
    setError(input, "");
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) fail(input, `Each photo must be smaller than ${MAX_FILE_MB} MB.`);
    else if (!(file.type.startsWith("image/") || IMAGE_EXT.test(file.name))) fail(input, "Photos must be jpg, png, gif, webp or heic.");
  });

  return first;
}

/* ---------------------------------------------------------------- send --- */

function status(form: HTMLFormElement, text: string, kind: "ok" | "error" | "busy" | "") {
  const el = form.querySelector<HTMLElement>("[data-lead-status]");
  if (!el) return;
  el.textContent = text;
  el.dataset.state = kind;
}

function buildData(form: HTMLFormElement): FormData {
  fillHidden(form);
  const data = new FormData(form);
  // Leave out empty file inputs so no blank images are sent.
  form.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => {
    if (input.name && !input.files?.length) data.delete(input.name);
  });
  if (!data.get("form_name")) data.set("form_name", FORM_NAME);
  if (!data.has(HONEYPOT)) data.set(HONEYPOT, "");
  return data;
}

async function send(form: HTMLFormElement) {
  const invalid = validate(form);
  if (invalid) {
    status(form, "Please fix the highlighted fields.", "error");
    (invalid as HTMLElement).focus();
    return;
  }

  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const label = button?.textContent ?? "";
  if (button) { button.disabled = true; button.textContent = "Sending…"; }
  status(form, "Sending…", "busy");

  try {
    const response = await fetch(form.action, { method: "POST", body: buildData(form), mode: "cors" });
    let json: { ok?: boolean; error?: string; message?: string } | null = null;
    try { json = JSON.parse(await response.text()); } catch { json = null; }
    if (response.status === 429) throw new Error(RATE_LIMIT_TEXT);
    if (!response.ok || !json || json.ok !== true) throw new Error(json?.error || json?.message || ERROR_TEXT);

    form.reset();
    reapplyCart(form);
    fillHidden(form);
    status(form, SUCCESS_TEXT, "ok");
  } catch (error) {
    const message = error instanceof Error && error.message && error.message !== "Failed to fetch" ? error.message : ERROR_TEXT;
    status(form, message, "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = label; }
  }
}

/* --------------------------------------------------------------- modal --- */

const CART_FIELDS: Array<[string, string]> = [
  ["brand", "brand"], ["model", "model"], ["vin", "vin_number"], ["sku", "sku_number"],
];

/** Modal forms lose their cart pre-fill on reset; put it back. */
function reapplyCart(form: HTMLFormElement) {
  const cart = form.dataset.leadCart ? (JSON.parse(form.dataset.leadCart) as Record<string, string>) : null;
  if (!cart) return;
  for (const [key, name] of CART_FIELDS) {
    const input = field(form, name);
    if (input && cart[key]) input.value = cart[key];
  }
}

function prefillModal(form: HTMLFormElement, trigger: HTMLElement) {
  const cart: Record<string, string> = {};
  for (const [key, name] of CART_FIELDS) {
    const value = trigger.dataset[`lead${key[0].toUpperCase()}${key.slice(1)}`] || "";
    const input = field(form, name) as HTMLInputElement | null;
    if (!input) continue;
    input.value = value;
    input.readOnly = Boolean(value);
    if (value) cart[key] = value;
  }
  form.dataset.leadCart = Object.keys(cart).length ? JSON.stringify(cart) : "";

  const about = form.querySelector<HTMLElement>("[data-lead-about]");
  const label = trigger.dataset.leadLabel || "";
  if (about) {
    about.hidden = !label;
    about.textContent = "";
    if (label) {
      const strong = document.createElement("strong");
      strong.textContent = label;
      about.append("Asking about: ", strong);
    }
  }
  status(form, "", "");
}

function initModal() {
  const dialog = document.querySelector<HTMLDialogElement>("[data-lead-modal]");
  if (!dialog) return;
  let opener: HTMLElement | null = null;

  const close = () => {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  };

  document.addEventListener("click", (event) => {
    const trigger = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-lead-open]");
    if (!trigger) return;
    event.preventDefault();
    opener = trigger;
    const form = dialog.querySelector<HTMLFormElement>("form[data-lead-form]");
    if (form) { prefillModal(form, trigger); fillHidden(form); }
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector<HTMLInputElement>('input[name="first_name"]')?.focus();
  });

  dialog.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    // A click on the backdrop lands on the <dialog> itself.
    if (target === dialog || target.closest("[data-lead-close]")) close();
  });
  dialog.addEventListener("close", () => opener?.focus());
}

/* ---------------------------------------------------------------- init --- */

export function initLeadForms() {
  firstTouch(); // capture landing-page UTMs even if the visitor never opens a form
  document.querySelectorAll<HTMLFormElement>("form[data-lead-form]").forEach(fillHidden);
  // Capture phase: runs before anything else and covers forms added later.
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || !form.matches("form[data-lead-form]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void send(form);
    },
    true,
  );
  initModal();
}
