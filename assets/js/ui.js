/* =========================================================================
   RSVPplease — UI helpers (no framework)
   Tiny DOM + escaping + toast / modal / drawer + inline icons.
   ========================================================================= */
(function () {
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "✶";
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }

  function money(cents) {
    return "$" + (cents / 100).toFixed(2).replace(/\.00$/, "");
  }

  function relTime(ts) {
    if (!ts) return "";
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    const m = Math.round(s / 60); if (m < 60) return m + "m ago";
    const h = Math.round(m / 60); if (h < 24) return h + "h ago";
    const d = Math.round(h / 24); if (d < 7) return d + "d ago";
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  /* ---- Inline icons (1.5px stroke, currentColor) ---------------------- */
  const ICONS = {
    plus: 'M12 5v14M5 12h14',
    calendar: 'M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11',
    chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    card: 'M2 7h20M2 5h20v14H2zM6 15h4',
    inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
    chevronLeft: 'M15 18l-6-6 6-6',
    send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
    check: 'M20 6 9 17l-5-5',
    x: 'M18 6 6 18M6 6l12 12',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
    trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    copy: 'M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
    phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
    sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z',
    heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21l8.84-8.61a5.5 5.5 0 0 0 0-7.78z',
    link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    pencil: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
    location: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    info: 'M12 16v-4M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    dots: 'M12 12h.01M19 12h.01M5 12h.01',
    archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  };

  function icon(name, cls = "ic") {
    const d = ICONS[name] || ICONS.info;
    return `<svg class="${cls}" viewBox="0 0 24 24" width="18" height="18" fill="none"
      stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="${d}"/></svg>`;
  }

  /* ---- Toast ----------------------------------------------------------- */
  function toast(msg, kind = "") {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = el('<div class="toast-wrap"></div>'); document.body.appendChild(wrap); }
    const ic = kind === "ok" ? icon("check") : kind === "err" ? icon("x") : icon("sparkle");
    const t = el(`<div class="toast ${kind}">${ic}<span>${esc(msg)}</span></div>`);
    wrap.appendChild(t);
    setTimeout(() => { t.style.transition = "opacity .25s, transform .25s"; t.style.opacity = "0"; t.style.transform = "translateY(8px)"; }, 2600);
    setTimeout(() => t.remove(), 2900);
  }

  /* ---- Modal ----------------------------------------------------------- */
  function modal({ title, body, actions }) {
    const overlay = el('<div class="modal-overlay"></div>');
    const m = el(`
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h2>${esc(title)}</h2></div>
        <div class="modal-body"></div>
        <div class="modal-foot"></div>
      </div>`);
    m.querySelector(".modal-body").append(typeof body === "string" ? el(`<div>${body}</div>`) : body);
    const foot = m.querySelector(".modal-foot");
    (actions || []).forEach((a) => {
      const b = el(`<button class="btn ${a.cls || ""}">${esc(a.label)}</button>`);
      b.addEventListener("click", () => a.onClick && a.onClick(close));
      foot.appendChild(b);
    });
    overlay.appendChild(m);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("open"));
    function close() { overlay.classList.remove("open"); setTimeout(() => overlay.remove(), 200); }
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", onEsc); }
    });
    return { close, root: m };
  }

  function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false, onConfirm }) {
    modal({
      title,
      body: `<p class="muted">${esc(message)}</p>`,
      actions: [
        { label: "Cancel", cls: "ghost", onClick: (c) => c() },
        { label: confirmLabel, cls: danger ? "danger" : "primary", onClick: (c) => { c(); onConfirm && onConfirm(); } },
      ],
    });
  }

  function copy(text) {
    navigator.clipboard?.writeText(text).then(
      () => toast("Copied to clipboard", "ok"),
      () => toast("Couldn't copy", "err")
    );
  }

  /* ---- Invite design (shared by the builder preview + guest RSVP page) -- */
  const InviteDesign = {
    PALETTES: {
      blush: ["#E85C86", "#B03059"], marigold: ["#EE9B2E", "#B4690E"], sage: ["#5BA77C", "#356E4D"],
      orchid: ["#9B5DE5", "#6B3FA0"], lagoon: ["#1FB0A6", "#0F7A73"], petal: ["#E58AA9", "#B86081"],
      navy: ["#2F4A87", "#1B2E59"], berry: ["#C0397A", "#8E2458"], sky: ["#3E8FD6", "#245b8f"], plum: ["#7E57A8", "#553C75"],
    },
    // Each theme = its own font + a distinct animated motif + a yes/no emoji
    // pair for the RSVP orbs. The colour comes from the selected palette
    // (works for every theme, dark or light).
    THEMES: {
      confetti: { label: "Confetti", palette: "blush",    dark: false, motif: "confetti", font: "'Bricolage Grotesque'", yes: "🎉", no: "😢" },
      sunset:   { label: "Sunset",   palette: "marigold", dark: false, motif: "sun",      font: "'Fredoka'",             yes: "🌞", no: "🌧️" },
      garden:   { label: "Garden",   palette: "sage",     dark: false, motif: "leaves",   font: "'Bricolage Grotesque'", yes: "🌿", no: "🥀" },
      bloom:    { label: "Bloom",    palette: "petal",    dark: false, motif: "petals",   font: "'Fredoka'",             yes: "🌸", no: "🥀" },
      breeze:   { label: "Breeze",   palette: "lagoon",   dark: false, motif: "bubbles",  font: "'Bricolage Grotesque'", yes: "🫧", no: "😢" },
      bold:     { label: "Bold",     palette: "navy",     dark: false, motif: "shine",    font: "'Space Grotesk'",       yes: "⚡", no: "😶" },
      elegant:  { label: "Elegant",  palette: "orchid",   dark: true,  motif: "sparkles", font: "'DM Serif Display'",    yes: "🥂", no: "😢" },
      midnight: { label: "Midnight", palette: "lagoon",   dark: true,  motif: "stars",    font: "'Space Grotesk'",       yes: "🌙", no: "☁️" },
      noir:     { label: "Noir",     palette: "navy",     dark: true,  motif: "shine",    font: "'Bricolage Grotesque'", yes: "🖤", no: "🥀" },
      hearts:   { label: "Hearts",   palette: "berry",    dark: false, motif: "hearts",   font: "'Fredoka'",             yes: "😍", no: "💔" },
      cars:     { label: "Cars",     palette: "sky",      dark: false, motif: "cars",     font: "'Space Grotesk'",       yes: "🏎️", no: "🛑" },
      dinos:    { label: "Dinosaurs",palette: "sage",     dark: false, motif: "dinos",    font: "'Fredoka'",             yes: "🦖", no: "🥲" },
      fairytale:{ label: "Fairytale",palette: "orchid",   dark: false, motif: "fairytale",font: "'DM Serif Display'",    yes: "✨", no: "🌧️" },
    },
    // Host-pickable title fonts (all already loaded on every page).
    FONTS: {
      classic: { label: "Classic", stack: "'Bricolage Grotesque'" },
      elegant: { label: "Elegant", stack: "'DM Serif Display'" },
      playful: { label: "Playful", stack: "'Fredoka'" },
      bold:    { label: "Bold",    stack: "'Space Grotesk'" },
    },
    themeOf(event) { return this.THEMES[event.theme] || this.THEMES.confetti; },
    titleFont(event) {
      const f = this.FONTS[event.titleFont];
      return f ? f.stack : this.themeOf(event).font;
    },
    choiceEmoji(event) {
      const th = this.themeOf(event);
      return { yes: th.yes || "🎉", no: th.no || "😢" };
    },
    background(event) {
      if (event.coverImageUrl) {
        return `background:linear-gradient(rgba(21,34,63,.32),rgba(21,34,63,.55)),url('${event.coverImageUrl.replace(/'/g, "%27")}') center/cover`;
      }
      const th = this.themeOf(event);
      const [c1, c2] = this.PALETTES[event.palette] || this.PALETTES[th.palette];
      // Dark themes blend the (darker) palette colour toward navy so the colour
      // still shows through; light themes use the full palette gradient.
      return th.dark
        ? `background:linear-gradient(150deg, ${c2}, #15223F)`
        : `background:linear-gradient(135deg, ${c1}, ${c2})`;
    },
    /* ---- Animated motifs (one per theme) ---- */
    confetti() {
      const colors = ["#FFD98E", "#ffffff", "#FFC7D6", "#9BE3B5", "#B7C7FF"];
      return `<div class="inv-motif inv-confetti" aria-hidden="true">${Array.from({ length: 14 }, (_, i) =>
        `<span style="left:${(i * 7.3 + 3) % 96}%;background:${colors[i % colors.length]};width:${6 + (i % 3) * 3}px;height:${6 + ((i + 1) % 3) * 3}px;animation-duration:${5 + (i % 5)}s;animation-delay:${(i % 7) * 0.7}s"></span>`).join("")}</div>`;
    },
    petals() {
      return `<div class="inv-motif inv-petals" aria-hidden="true">${Array.from({ length: 11 }, (_, i) =>
        `<span style="left:${(i * 9 + 3) % 95}%;font-size:${13 + (i % 3) * 5}px;animation-duration:${6 + (i % 4)}s;animation-delay:${(i % 6) * 0.6}s">❀</span>`).join("")}</div>`;
    },
    leaves() {
      return `<div class="inv-motif inv-leaves" aria-hidden="true">${Array.from({ length: 10 }, (_, i) =>
        `<span style="left:${(i * 10 + 3) % 95}%;animation-duration:${7 + (i % 4)}s;animation-delay:${(i % 5) * 0.8}s"></span>`).join("")}</div>`;
    },
    sun() {
      return `<div class="inv-motif inv-sun" aria-hidden="true"><span class="inv-sun__rays"></span><span class="inv-sun__disc"></span></div>`;
    },
    bubbles() {
      return `<div class="inv-motif inv-bubbles" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => {
        const s = 8 + (i % 4) * 5;
        return `<span style="left:${(i * 8 + 3) % 96}%;width:${s}px;height:${s}px;animation-duration:${6 + (i % 5)}s;animation-delay:${(i % 6) * 0.7}s"></span>`;
      }).join("")}</div>`;
    },
    sparkles() {
      const pts = [[12, 24], [80, 18], [62, 58], [30, 70], [88, 50], [46, 30], [22, 46], [70, 38]];
      const star = "M12 2C12.6 8.2 15.8 11.4 22 12C15.8 12.6 12.6 15.8 12 22C11.4 15.8 8.2 12.6 2 12C8.2 11.4 11.4 8.2 12 2Z";
      return `<div class="inv-motif inv-sparkles" aria-hidden="true">${pts.map(([x, y], i) =>
        `<svg viewBox="0 0 24 24" style="left:${x}%;top:${y}%;animation-delay:${i * 0.35}s"><path d="${star}"/></svg>`).join("")}</div>`;
    },
    stars() {
      return `<div class="inv-motif inv-stars" aria-hidden="true">${Array.from({ length: 22 }, (_, i) =>
        `<span style="left:${(i * 4.6 + 2) % 98}%;top:${(i * 13 + 5) % 88}%;animation-duration:${1.8 + (i % 5) * 0.5}s;animation-delay:${(i % 8) * 0.3}s"></span>`).join("")}</div>`;
    },
    shine() { return `<div class="inv-motif inv-shine" aria-hidden="true"></div>`; },
    // Host-picked emoji effect (grapheme-safe split, max 8 distinct emoji).
    emojiList(s) {
      let parts;
      try {
        parts = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(String(s || ""))].map((x) => x.segment);
      } catch (e) { parts = Array.from(String(s || "")); }
      return parts.filter((t) => t.trim() && !/^[\w\s.,!?'"@#$%^&*()[\]{}<>\/\\|;:+=~`-]+$/.test(t)).slice(0, 8);
    },
    emojiFx(list) {
      return `<div class="inv-motif inv-emojifx" aria-hidden="true">${Array.from({ length: 12 }, (_, i) =>
        `<span style="left:${(i * 8.3 + 2) % 96}%;font-size:${16 + (i % 3) * 8}px;animation-duration:${5 + (i % 5)}s;animation-delay:${(i % 7) * 0.8}s">${list[i % list.length]}</span>`).join("")}</div>`;
    },
    hearts() {
      const hs = ["💗", "💖", "❤️", "💕", "💘", "💞"];
      return `<div class="inv-motif inv-hearts" aria-hidden="true">${Array.from({ length: 13 }, (_, i) =>
        `<span style="left:${(i * 7.7 + 3) % 95}%;font-size:${15 + (i % 3) * 8}px;animation-duration:${5 + (i % 4)}s;animation-delay:${(i % 7) * 0.7}s">${hs[i % hs.length]}</span>`).join("")}</div>`;
    },
    cars() {
      const cs = ["🚗", "🏎️", "🚙", "🚕", "🚐", "🚓"];
      return `<div class="inv-motif inv-cars" aria-hidden="true">${Array.from({ length: 6 }, (_, i) =>
        `<span style="top:${9 + i * 15}%;font-size:${22 + (i % 3) * 6}px;animation-duration:${6 + (i % 4) * 2}s;animation-delay:${i * 1.1}s">${cs[i % cs.length]}</span>`).join("")}</div>`;
    },
    dinos() {
      const ds = ["🦕", "🦖", "🦕", "🦖"];
      return `<div class="inv-motif inv-dinos" aria-hidden="true">${Array.from({ length: 8 }, (_, i) =>
        `<span style="left:${(i * 12 + 4) % 90}%;bottom:${(i % 3) * 9}px;font-size:${22 + (i % 3) * 9}px;animation-duration:${1.5 + (i % 4) * 0.4}s;animation-delay:${(i % 5) * 0.5}s">${ds[i % ds.length]}</span>`).join("")}</div>`;
    },
    fairytale() {
      const fs = ["✨", "🦄", "⭐", "💫", "🏰", "🌙", "🧚", "🌟"];
      return `<div class="inv-motif inv-fairytale" aria-hidden="true">${Array.from({ length: 12 }, (_, i) =>
        `<span style="left:${(i * 8.5 + 3) % 95}%;top:${(i * 17 + 6) % 82}%;font-size:${15 + (i % 3) * 7}px;animation-duration:${3 + (i % 4)}s;animation-delay:${(i % 6) * 0.5}s">${fs[i % fs.length]}</span>`).join("")}</div>`;
    },
    motifHTML(event) {
      // A host-picked emoji set overrides the theme's built-in motif.
      const em = this.emojiList(event.effectEmoji);
      if (em.length) return this.emojiFx(em);
      const m = this.themeOf(event).motif;
      return typeof this[m] === "function" ? this[m]() : "";
    },
    // Full-viewport background for the guest RSVP page (cover image stays in
    // the banner — the page behind it always gets the palette gradient).
    pageBackground(event) {
      const th = this.themeOf(event);
      const [c1, c2] = this.PALETTES[event.palette] || this.PALETTES[th.palette];
      return th.dark
        ? `background:linear-gradient(160deg, ${c2} 0%, #15223F 55%, #0E1830 100%)`
        : `background:linear-gradient(160deg, ${c1} 0%, ${c2} 100%)`;
    },
    // Fixed effect layer that floats the motif/emoji across the whole viewport.
    pageLayer(event) {
      return `<div class="inv-pagefx" aria-hidden="true">${this.motifHTML(event)}</div>`;
    },
    // The invitation banner. `tag` lets callers avoid a second h1 on dashboard pages.
    banner(event, tag = "h1") {
      const th = this.themeOf(event);
      const hostName = event.hostName || "Your host";
      return `
        <div class="inv-banner${th.dark ? " inv-banner--dark" : ""}" style="${this.background(event)}">
          ${this.motifHTML(event)}
          <span class="inv-kicker">You're invited!</span>
          <${tag} class="inv-title" style="font-family:${this.titleFont(event)},Georgia,serif">${esc(event.name || "Your party")}</${tag}>
          <span class="inv-hostline"><span class="inv-host-av">${esc((hostName[0] || "♥").toUpperCase())}</span>Hosted by ${esc(hostName)}</span>
        </div>`;
    },
  };
  window.InviteDesign = InviteDesign;

  window.UI = { esc, el, icon, initials, money, relTime, toast, modal, confirmDialog, copy };
})();
