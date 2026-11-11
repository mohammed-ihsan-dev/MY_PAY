// After `next build` (static export to ./out): place the service worker at the
// site root (/sw.js) so it can control every page, not only /serwist/*.
import { copyFileSync, existsSync, readdirSync } from "node:fs";

const src = "out/serwist";
if (!existsSync(`${src}/sw.js`)) {
  console.error("✗ out/serwist/sw.js was not generated.");
  process.exit(1);
}
for (const f of readdirSync(src)) copyFileSync(`${src}/${f}`, `out/${f}`);
console.log("✓ Service worker copied to out/sw.js");
