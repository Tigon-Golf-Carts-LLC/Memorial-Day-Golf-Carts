#!/usr/bin/env node
/**
 * Serve dist/ the way a static host does, for `npm run preview`.
 *
 * Deliberately dumb: no rewrites beyond directory-index resolution, and a 404
 * falls through to dist/404.html. That is what GitHub Pages does, so a deep
 * link that works here works there.
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, extname, normalize } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(root, "dist");
const PORT = Number(process.env.PORT ?? 5000);
const HOST = process.env.HOST ?? "0.0.0.0";
const BASE_PATH = (process.env.BASE_PATH || "/").replace(/\/*$/, "/");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

if (!existsSync(DIST)) {
  process.stderr.write("dist/ does not exist. Run `npm run build` first.\n");
  process.exit(1);
}

/** Resolve a request path to a file inside dist/, or null. */
function resolveFile(urlPath: string): string | null {
  let pathname = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  // Strip the deployment base path, as the host would.
  if (BASE_PATH !== "/" && pathname.startsWith(BASE_PATH)) {
    pathname = `/${pathname.slice(BASE_PATH.length)}`;
  }
  // Reject traversal before touching the filesystem.
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const target = join(DIST, safe);
  if (!target.startsWith(DIST)) return null;

  if (existsSync(target) && statSync(target).isFile()) return target;
  const index = join(target, "index.html");
  if (existsSync(index) && statSync(index).isFile()) return index;
  return null;
}

const server = createServer((request, response) => {
  const file = resolveFile(request.url ?? "/");
  if (file) {
    const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    const body = readFileSync(file);
    response.writeHead(200, { "Content-Type": type, "Content-Length": body.length });
    response.end(request.method === "HEAD" ? undefined : body);
    return;
  }
  const notFound = join(DIST, "404.html");
  if (existsSync(notFound)) {
    const body = readFileSync(notFound);
    response.writeHead(404, { "Content-Type": TYPES[".html"], "Content-Length": body.length });
    response.end(request.method === "HEAD" ? undefined : body);
    return;
  }
  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("Not found");
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Serving dist/ at http://localhost:${PORT}${BASE_PATH}\n`);
});
