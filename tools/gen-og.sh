#!/bin/bash
# Generate per-page Open Graph images (1200x630) from a shared template.
# Requires macOS qlmanage + sips. Run: bash tools/gen-og.sh
set -e
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"

# gen <output-basename> <line1> <line2> <subtitle>
gen() {
  name="$1"; l1="$2"; l2="$3"; sub="$4"
  # qlmanage renders SVGs onto a 1200x1200 SQUARE and ignores text-anchor.
  # So: author a 1200x1200 SVG (full-bleed background) with the design in the
  # centre 1200x630 band (y 285..915), render square, then CROP the centre out
  # to 1200x630 with `sips -c` (crop, NOT resize — resizing squashed the text).
  cat > "$OUT/$name.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="1200" height="1200">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#FCEFF4"/></linearGradient></defs>
  <rect width="1200" height="1200" fill="url(#bg)"/>
  <circle cx="1090" cy="380" r="270" fill="#FBE6EE" opacity="0.6"/>
  <circle cx="120" cy="900" r="210" fill="#FBE6EE" opacity="0.5"/>
  <g transform="translate(84,455)"><rect x="0" y="-54" width="378" height="108" rx="30" fill="#E58AA9"/><path d="M40 54 L14 96 L96 54 Z" fill="#E58AA9"/><text x="30" y="20" font-family="'Helvetica Neue',Helvetica,Arial,sans-serif" font-size="60" font-weight="800" letter-spacing="-2" fill="#ffffff"><tspan>RSVP</tspan><tspan font-weight="500" fill-opacity="0.92"> please</tspan></text></g>
  <text x="84" y="655" font-family="Georgia,'Times New Roman',serif" font-size="58" font-weight="700" fill="#15223F">$l1</text>
  <text x="84" y="725" font-family="Georgia,'Times New Roman',serif" font-size="58" font-weight="700" fill="#E58AA9">$l2</text>
  <text x="84" y="797" font-family="'Helvetica Neue',Helvetica,Arial,sans-serif" font-size="26" fill="#4A5C85">$sub</text>
</svg>
SVG
  qlmanage -t -s 1200 -o "$OUT" "$OUT/$name.svg" >/dev/null 2>&1
  sips -c 630 1200 "$OUT/$name.svg.png" --out "assets/img/$name.png" >/dev/null 2>&1
  echo "wrote $name.png"
}

# Default (homepage / shared link preview) — lead with FREE.
gen og           "Free to start."       "Just share a link."      "Every guest gets a link to RSVP · SMS nudges from \$10"
gen og-how       "From guest list to"   "a real headcount."       "Share links free, or auto-nudge the no-shows by text."
gen og-templates "Every text,"          "in your words."          "Customise your invite, nudge and auto-replies — SMS + email."
gen og-pricing   "Free to share."       "\$10 to text."            "Share RSVP links free — SMS nudges from \$10 a party, no subscription."
gen og-stories   "Built for"            "a full table."           "Two-way SMS, auto-nudges and a real headcount."
gen og-about     "Made by a kid"        "for every tired host."   "The 12-year-old who got sick of chasing RSVPs."

rm -rf "$OUT"
