#!/bin/bash
# Generate per-page Open Graph images (1200x630) from a shared template.
# Requires macOS qlmanage + sips. Run: bash tools/gen-og.sh
set -e
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"

gen() {
  route="$1"; l1="$2"; l2="$3"; sub="$4"
  cat > "$OUT/$route.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#FCEFF4"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1080" cy="70" r="300" fill="#FBE6EE" opacity="0.65"/>
  <circle cx="120" cy="600" r="220" fill="#FBE6EE" opacity="0.5"/>
  <g transform="translate(82,150)"><rect x="0" y="-54" width="378" height="108" rx="30" fill="#E58AA9"/><path d="M40 54 L14 96 L96 54 Z" fill="#E58AA9"/><text x="30" y="20" font-family="'Helvetica Neue',Helvetica,Arial,sans-serif" font-size="60" font-weight="800" letter-spacing="-2" fill="#ffffff"><tspan>RSVP</tspan><tspan font-weight="500" fill-opacity="0.92"> please</tspan></text></g>
  <text x="84" y="352" font-family="Georgia,'Times New Roman',serif" font-size="52" font-weight="700" fill="#15223F">$l1</text>
  <text x="84" y="418" font-family="Georgia,'Times New Roman',serif" font-size="52" font-weight="700" fill="#E58AA9">$l2</text>
  <text x="84" y="484" font-family="'Helvetica Neue',Helvetica,Arial,sans-serif" font-size="24" fill="#4A5C85">$sub</text>
</svg>
SVG
  qlmanage -t -s 1200 -o "$OUT" "$OUT/$route.svg" >/dev/null 2>&1
  sips -z 630 1200 "$OUT/$route.svg.png" --out "assets/img/og-$route.png" >/dev/null 2>&1
  echo "wrote og-$route.png"
}

gen how       "From guest list to"  "a real headcount."       "Add guests, send, and auto-nudge the no-shows by text."
gen templates "Every text,"         "in your words."          "Customise your invite, nudge and auto-replies — SMS + email."
gen pricing   "\$10 a party."        "Then just \$1 a guest."   "No subscription — pay only when you send."
gen stories   "Built for"           "a full table."           "Two-way SMS, auto-nudges and a real headcount."
gen about     "Made by a kid"        "for every tired host."   "The 12-year-old who got sick of chasing RSVPs."

rm -rf "$OUT"
