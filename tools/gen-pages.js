#!/usr/bin/env node
/* Prerender the marketing pages from index.html.
   Each output file is a full copy of index.html with its own <title>, meta
   description and Open Graph/Twitter tags baked in (so crawlers and social
   share bots see correct per-page metadata), plus data-route on #app so the
   SPA renders that page on load. Run after editing index.html:  node tools/gen-pages.js
*/
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const base = fs.readFileSync(path.join(root, "index.html"), "utf8");
const esc = (s) => s.replace(/&/g, "&amp;");

// route -> [title (<60), description (<160), absolute url]
const PAGES = {
  how:       ["How RSVPplease works — SMS & email RSVPs", "Add guests, send invites by text or email, and let RSVPplease auto-nudge non-responders until your headcount is locked in.", "https://rsvpplease.app/how"],
  templates: ["Message templates — RSVPplease", "Customise your invite, nudge and yes/no auto-replies for SMS and email, with a live phone preview as you type.", "https://rsvpplease.app/templates"],
  pricing:   ["Pricing — RSVPplease", "$10 per event covers up to 10 guests, then $1 each. No subscription — pay only when you send your invitations.", "https://rsvpplease.app/pricing"],
  stories:   ["Why RSVPplease works", "Two-way SMS, automatic nudges and a real headcount for your next event — see why guests actually reply.", "https://rsvpplease.app/stories"],
  about:     ["About RSVPplease — our story", "RSVPplease was built by a 12-year-old tired of watching her mum chase everyone for a simple yes or no. This is her story.", "https://rsvpplease.app/about"],
};

for (const [route, [title, desc, url]] of Object.entries(PAGES)) {
  const T = esc(title), D = esc(desc);
  // String-return replacers so "$" in values isn't treated as a backreference.
  let h = base
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${T}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, (_, a, b) => a + D + b)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, (_, a, b) => a + url + b)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, (_, a, b) => a + url + b)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, (_, a, b) => a + T + b)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, (_, a, b) => a + T + b)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, (_, a, b) => a + D + b)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, (_, a, b) => a + D + b)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, (_, a, b) => a + `https://rsvpplease.app/assets/img/og-${route}.png` + b)
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/, (_, a, b) => a + `https://rsvpplease.app/assets/img/og-${route}.png` + b)
    .replace('<div id="app" class="shell">', `<div id="app" class="shell" data-route="${route}">`);
  fs.writeFileSync(path.join(root, `${route}.html`), h);
  console.log("wrote", route + ".html");
}
