/**
 * Site chrome: mobile navigation, the vehicle gallery, and an image fallback.
 *
 * There is no theme toggle: the stylesheet follows `prefers-color-scheme`, so
 * there is no state to persist and no flash to guard against.
 *
 * The stylesheet is imported here so Vite hashes it and records the filename in
 * its manifest; script/prerender.ts reads that and emits the <link> itself, so
 * the CSS is never loaded by JavaScript at runtime.
 */

import "../styles/site.css";

/* ------------------------------------------------------------ mobile nav --- */

const navToggle = document.querySelector<HTMLElement>("[data-nav-toggle]");
const mobileNav = document.getElementById("mobilenav");
if (navToggle && mobileNav) {
  navToggle.addEventListener("click", () => {
    const open = mobileNav.dataset.open === "true";
    mobileNav.dataset.open = open ? "false" : "true";
    navToggle.setAttribute("aria-expanded", open ? "false" : "true");
  });
}

/* --------------------------------------------------------------- gallery --- */

const gallery = document.querySelector<HTMLElement>("[data-gallery]");
if (gallery) {
  const main = gallery.querySelector<HTMLImageElement>("[data-gallery-main]");
  const thumbs = gallery.querySelectorAll<HTMLElement>("[data-gallery-thumb]");
  thumbs.forEach((thumb) => {
    thumb.addEventListener("click", () => {
      const source = thumb.dataset.src;
      if (!source || !main) return;
      // Swapping the hero means the srcset no longer describes it, so it is
      // cleared rather than left pointing at the previous photograph.
      main.removeAttribute("srcset");
      main.removeAttribute("sizes");
      main.src = source;
      main.alt = thumb.dataset.alt || main.alt;
      thumbs.forEach((other) => other.setAttribute("aria-current", other === thumb ? "true" : "false"));
    });
  });
}

/* -------------------------------------------- image fallback for a 404 --- */

/**
 * A cart photo that 404s (removed from the bucket between refreshes) falls back
 * to the placeholder rather than rendering as a broken image.
 */
document.addEventListener(
  "error",
  (event) => {
    const target = event.target as HTMLImageElement | null;
    if (!target || target.tagName !== "IMG" || target.dataset.fallbackApplied) return;
    if (target.src.includes("cart-photo-coming-soon")) return;
    target.dataset.fallbackApplied = "1";
    target.removeAttribute("srcset");
    target.removeAttribute("sizes");
    // BASE_URL keeps the placeholder correct under a project-site base path.
    target.src = `${import.meta.env.BASE_URL}images/cart-photo-coming-soon.svg`.replace(/\/{2,}/g, "/");
  },
  true,
);

export {};
