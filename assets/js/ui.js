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

  window.UI = { esc, el, icon, initials, money, relTime, toast, modal, confirmDialog, copy };
})();
