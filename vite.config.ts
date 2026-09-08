/**
 * Vite bundles the CSS and the two client modules; script/prerender.ts writes
 * the HTML. Vite is not asked to produce pages, so there is no index.html
 * template to keep in sync with the renderers.
 *
 * Phase 5: `base` is the one place the deployment path is set. It comes from
 * BASE_PATH so the same build works for a custom domain ("/") and a project
 * site ("/<repo-name>/"), and the client reads the same value through
 * import.meta.env.BASE_URL.
 */

import { defineConfig } from "vite";

const base = (() => {
  let value = process.env.BASE_PATH || "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (!value.endsWith("/")) value = `${value}/`;
  return value.replace(/\/{2,}/g, "/");
})();

export default defineConfig({
  base,
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // The prerenderer reads this to find the hashed filenames.
    manifest: true,
    cssCodeSplit: false,
    minify: "esbuild",
    target: "es2020",
    // Every asset is fingerprinted, so it can be cached immutably.
    assetsDir: "assets",
    rollupOptions: {
      // The stylesheet is imported by src/client/site.ts rather than listed
      // here: with cssCodeSplit disabled Vite rejects a CSS entry, and going
      // through the JS entry is what puts the hashed CSS filename into the
      // manifest for the prerenderer to read.
      input: {
        site: "src/client/site.ts",
        inventory: "src/client/inventory.ts",
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    // The inventory module carries the filter engine; 40 KB is a realistic
    // ceiling for it, and a warning past that is a signal, not noise.
    chunkSizeWarningLimit: 64,
    reportCompressedSize: true,
  },
  esbuild: {
    legalComments: "none",
  },
});
