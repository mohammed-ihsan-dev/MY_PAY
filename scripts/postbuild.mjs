// After `next build` (static export to ./out): place the service worker at the
// site root (/sw.js) so it can control every page, not only /serwist/*.
// The original stays at /serwist/sw.js. The build fails if the worker is
// missing, empty or has no precache manifest, so a broken PWA is never deployed.
import { copyFileSync, existsSync, readdirSync, readFileSync } from "node:fs";

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const src = "out/serwist";
if (!existsSync(`${src}/sw.js`)) fail("out/serwist/sw.js was not generated (is esbuild installed?).");
const sw = readFileSync(`${src}/sw.js`, "utf8");
if (sw.length < 1000) fail(`out/serwist/sw.js is too small (${sw.length} bytes).`);
for (const url of ["/dashboard", "/salary", "/manifest.webmanifest", "/_next/static/"]) {
  if (!sw.includes(`"${url}`)) fail(`The service worker precache manifest is missing ${url}.`);
}
for (const f of ["index.html", "dashboard.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"]) {
  if (!existsSync(`out/${f}`)) fail(`out/${f} is missing from the build.`);
}

for (const f of readdirSync(src)) copyFileSync(`${src}/${f}`, `out/${f}`);
const entries = (sw.match(/"url":"|url:"/g) ?? []).length;
console.log(`✓ Service worker checked (${Math.round(sw.length / 1024)} KB, ~${entries} precached files) and copied to out/sw.js`);
