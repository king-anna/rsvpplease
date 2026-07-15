/* =========================================================================
   RSVPplease — API (data-layer seam)
   -------------------------------------------------------------------------
   Every view talks to the app ONLY through this async interface. Phase 1
   implements it with the localStorage Store; Phase 2 re-implements the same
   method names against Supabase + Edge Functions and flips RSVP_CONFIG.BACKEND.
   Views never change.
   ========================================================================= */
(function () {
  const cfg = window.RSVP_CONFIG;

  /* ---- Customisable message templates --------------------------------- */
  const TEMPLATE_TYPES = [
    { key: "invite",   label: "Invitation",     hint: "First message with the RSVP link." },
    { key: "nudge",    label: "Follow-up nudge", hint: "Auto-sent when there's no reply." },
    { key: "replyYes", label: "“Yes” reply",     hint: "Auto-reply when a guest confirms." },
    { key: "replyNo",  label: "“No” reply",      hint: "Auto-reply when a guest declines." },
  ];

  const TEMPLATE_VARS = [
    "{{guest_name}}", "{{event_name}}", "{{date}}", "{{location}}", "{{rsvp_link}}", "{{host_name}}",
  ];

  const DEFAULT_TEMPLATES = {
    invite:
      "Hi {{guest_name}}! 💌 You're invited to {{event_name}} on {{date}}. " +
      "Tap to RSVP: {{rsvp_link}} — or just reply YES or NO. Hope you can make it!",
    nudge:
      "Hi {{guest_name}}, a gentle nudge about {{event_name}} on {{date}} — " +
      "we'd love to know if you can come! RSVP: {{rsvp_link}} (or reply YES/NO).",
    replyYes:
      "Yay! 🎉 So happy you'll be joining {{event_name}}, {{guest_name}}. " +
      "We'll send details closer to {{date}}. See you there!",
    replyNo:
      "Thanks for letting us know, {{guest_name}}. We'll miss you at {{event_name}}, " +
      "but completely understand. 💕",
  };

  /* ---- Small utils ----------------------------------------------------- */
  function fmtDate(iso) {
    if (!iso) return "the big day";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const hasTime = /\d{2}:\d{2}/.test(iso);
    const opts = { weekday: "short", month: "short", day: "numeric" };
    let s = d.toLocaleDateString(undefined, opts);
    if (hasTime) s += " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return s;
  }

  function rsvpLink(token) {
    return new URL("rsvp.html?t=" + encodeURIComponent(token), window.location.href).href;
  }

  function render(body, { guest, event, host }) {
    const map = {
      "{{guest_name}}": (guest && guest.name) || "there",
      "{{event_name}}": (event && event.name) || "our event",
      "{{date}}": fmtDate(event && event.date),
      "{{location}}": (event && event.location) || "",
      "{{rsvp_link}}": guest ? rsvpLink(guest.token) : "{{rsvp_link}}",
      "{{host_name}}": (host && host.name) || (event && event.hostName) || "your host",
    };
    return body.replace(/\{\{\s*\w+\s*\}\}/g, (m) => {
      const key = "{{" + m.replace(/[^a-z_]/gi, "") + "}}";
      return key in map ? map[key] : m;
    });
  }

  /* ---- Counts ---------------------------------------------------------- */
  function countsFor(eventId, db) {
    const gs = Object.values(db.guests).filter((g) => g.eventId === eventId);
    // `chargeable` = host-added guests (self-registered open-link guests are
    // never texted, so never billed).
    const c = { total: gs.length, confirmed: 0, declined: 0, pending: 0, party: 0, chargeable: 0 };
    for (const g of gs) {
      if (g.status === "confirmed") { c.confirmed++; c.party += g.partySize || 1; }
      else if (g.status === "declined") c.declined++;
      else c.pending++;
      if (!g.selfRegistered) c.chargeable++;
    }
    return c;
  }

  function decorateEvent(ev, db) {
    return Object.assign({}, ev, { counts: countsFor(ev.id, db) });
  }

  // Events stored before the open-invite feature get a shareable token lazily.
  function ensureOpenTokens(db) {
    let changed = false;
    for (const e of Object.values(db.events)) {
      if (!e.openToken) { e.openToken = window.Store.uid("j") + window.Store.uid(""); changed = true; }
    }
    if (changed) window.Store.save(db);
  }

  /* ---- Local (Phase 1) implementation ---------------------------------- */
  const local = {
    /* Auth */
    async getHost() {
      const h = window.Store.load().host;
      return h ? Object.assign({ role: "host", comped: false }, h) : null;
    },
    async adminOverview() { return []; },
    async adminSetComped() { return { ok: true }; },
    async signIn({ name, email }) {
      const db = window.Store.load();
      db.host = db.host || { id: window.Store.uid("h"), name, email };
      db.host.name = name; db.host.email = email;
      window.Store.save(db);
      return db.host;
    },
    // Preview mode has no real auth server — password sign-in/up just start a
    // local session (any password works) so the flow is demoable.
    async signInPassword({ name, email }) { const h = await this.signIn({ name: name || (email || "").split("@")[0], email }); return { ok: true, host: h }; },
    async signUpPassword({ name, email }) { await this.signIn({ name, email }); return { ok: true, session: true, needsConfirm: false }; },
    async resetPassword(email) { return { pending: true, email }; },
    async updatePassword() { return { ok: true }; },
    async signOut() {
      const db = window.Store.load();
      db.host = null; window.Store.save(db);
    },

    /* Events */
    async listEvents() {
      const db = window.Store.load();
      ensureOpenTokens(db);
      return Object.values(db.events)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .map((ev) => decorateEvent(ev, db));
    },
    async getEvent(id) {
      const db = window.Store.load();
      ensureOpenTokens(db);
      const ev = db.events[id];
      return ev ? decorateEvent(ev, db) : null;
    },
    async createEvent(data) {
      const db = window.Store.load();
      const id = window.Store.uid("e");
      const ev = {
        id,
        hostId: db.host && db.host.id,
        hostName: db.host && db.host.name,
        name: data.name || "Untitled event",
        description: data.description || "",
        date: data.date || "",
        location: data.location || "",
        rsvpDeadline: data.rsvpDeadline || "",
        nudgeAfterHours: Number(data.nudgeAfterHours) || cfg.DEFAULT_NUDGE_AFTER_HOURS,
        nudgeMax: Number(data.nudgeMax) || cfg.DEFAULT_NUDGE_MAX,
        theme: data.theme || "confetti",
        palette: data.palette || "blush",
        spots: Number(data.spots) || 40,
        allowPlusOne: data.allowPlusOne !== false,
        coverImageUrl: data.coverImageUrl || "",
        titleFont: data.titleFont || null,
        effectEmoji: data.effectEmoji || "",
        extras: data.extras || {},
        guestQuestion: data.guestQuestion || "",
        hideAddress: !!data.hideAddress,
        showGuests: !!data.showGuests,
        openToken: window.Store.uid("j") + window.Store.uid(""),
        templates: Object.assign({}, DEFAULT_TEMPLATES),
        status: "draft",
        paidAt: null,
        guestCountAtPayment: 0,
        archived: false,
        createdAt: Date.now(),
      };
      db.events[id] = ev;
      window.Store.save(db);
      return decorateEvent(ev, db);
    },
    async updateEvent(id, patch) {
      const db = window.Store.load();
      if (!db.events[id]) throw new Error("Event not found");
      Object.assign(db.events[id], patch);
      window.Store.save(db);
      return decorateEvent(db.events[id], db);
    },
    async deleteEvent(id) {
      const db = window.Store.load();
      delete db.events[id];
      for (const g of Object.values(db.guests)) if (g.eventId === id) delete db.guests[g.id];
      for (const m of Object.values(db.messages)) if (m.eventId === id) delete db.messages[m.id];
      window.Store.save(db);
    },

    /* Guests */
    async listGuests(eventId) {
      const db = window.Store.load();
      return Object.values(db.guests)
        .filter((g) => g.eventId === eventId)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    },
    async getGuestByToken(token) {
      const db = window.Store.load();
      const guest = Object.values(db.guests).find((g) => g.token === token);
      if (!guest) return null;
      const ev = db.events[guest.eventId] || null;
      if (!ev) return { guest, event: null };
      // Mirror the backend's privacy gating: hidden address until THIS guest
      // confirms; going count/names only when opted in AND they've responded.
      const responded = guest.status === "confirmed" || guest.status === "declined";
      const locationHidden = !!ev.hideAddress && guest.status !== "confirmed";
      const showSocial = !!ev.showGuests && responded;
      const confirmed = Object.values(db.guests)
        .filter((g) => g.eventId === ev.id && g.status === "confirmed");
      const respondedGuests = Object.values(db.guests)
        .filter((g) => g.eventId === ev.id && (g.status === "confirmed" || g.status === "declined") && g.respondedAt)
        .sort((a, b) => b.respondedAt - a.respondedAt);
      return { guest, event: Object.assign({}, ev, {
        location: locationHidden ? "" : ev.location,
        locationHidden,
        goingCount: showSocial ? confirmed.reduce((s, g) => s + (Number(g.partySize) || 1), 0) : null,
        goingNames: showSocial ? confirmed.slice(0, 8).map((g) => ((g.name || "").trim() || "A guest").split(/\s+/)[0]) : [],
        activity: showSocial ? respondedGuests.slice(0, 8).map((g) => ({
          name: ((g.name || "").trim() || "A guest").split(/\s+/)[0],
          status: g.status, note: (g.note || "").trim(), at: g.respondedAt,
        })) : [],
      }) };
    },
    // Open invite (/join/<open_token>): the party view for someone not yet on
    // the guest list. No address (when hidden) and no social data — they
    // haven't responded. Older stored events get a token lazily.
    async getOpenInvite(openToken) {
      const db = window.Store.load();
      ensureOpenTokens(db);
      const ev = Object.values(db.events).find((e) => e.openToken === openToken && !e.archived);
      if (!ev) return null;
      return { event: Object.assign({}, ev, {
        location: ev.hideAddress ? "" : ev.location,
        locationHidden: !!ev.hideAddress,
        goingCount: null, goingNames: [], activity: [],
      }) };
    },
    // Self-serve RSVP with the same guards as the backend: honeypot pretends
    // success, phone must be 7–15 digits, 300-signup cap, dedupe by last-10
    // digits (repeat submits update the same guest).
    async openRsvp(openToken, { name, phone, status, partySize, note, answer, hp }) {
      if ((hp || "").trim()) return { ok: true, token: null, autoReply: "" };
      const db = window.Store.load();
      const ev = Object.values(db.events).find((e) => e.openToken === openToken && !e.archived);
      if (!ev) throw new Error("Invite not found");
      if (!(name || "").trim()) throw new Error("Please tell us your name");
      const digits = (phone || "").replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) throw new Error("Please add a valid phone number");
      const regs = Object.values(db.guests).filter((g) => g.eventId === ev.id && g.selfRegistered);
      if (regs.length >= 300) throw new Error("This party is not accepting more sign-ups");
      const now = Date.now();

      let g = Object.values(db.guests).find((x) =>
        x.eventId === ev.id && (x.phone || "").replace(/\D/g, "").slice(-10) === digits.slice(-10));
      if (g) {
        g.status = status;
        g.respondedAt = now;
        g.name = (g.name || "").trim() || name.trim();
        if (status === "confirmed" && partySize) g.partySize = Math.max(1, Math.min(20, Number(partySize) || 1));
        if ((note || "").trim()) g.note = note.trim();
        if ((answer || "").trim()) g.answer = answer.trim();
      } else {
        const id = window.Store.uid("g");
        g = {
          id, eventId: ev.id, name: name.trim().slice(0, 80), phone: "+" + digits,
          email: "", channel: "sms",
          partySize: status === "confirmed" ? Math.max(1, Math.min(20, Number(partySize) || 1)) : 1,
          status, token: window.Store.uid("t") + window.Store.uid(""),
          note: (note || "").trim(), answer: (answer || "").trim(),
          selfRegistered: true, invitedAt: null, respondedAt: now,
          nudgeCount: 0, lastNudgeAt: null, createdAt: now,
        };
        db.guests[id] = g;
      }

      db.messages[window.Store.uid("m")] = {
        id: window.Store.uid("m"), eventId: ev.id, guestId: g.id,
        direction: "in", kind: "rsvp",
        body: (status === "confirmed" ? "✅ Confirmed via open invite" : "🙅 Declined via open invite") +
          ((note || "").trim() ? ` — “${note.trim()}”` : ""),
        createdAt: now,
      };
      const tplKey = status === "confirmed" ? "replyYes" : "replyNo";
      const replyBody = render(ev.templates[tplKey], { guest: g, event: ev, host: db.host });
      db.messages[window.Store.uid("m")] = {
        id: window.Store.uid("m"), eventId: ev.id, guestId: g.id,
        direction: "out", kind: tplKey, body: replyBody, createdAt: now + 1,
      };
      window.Store.save(db);
      return { ok: true, token: g.token, autoReply: replyBody };
    },
    async addGuests(eventId, list) {
      const db = window.Store.load();
      const created = [];
      for (const item of list) {
        const id = window.Store.uid("g");
        const g = {
          id, eventId,
          name: (item.name || "").trim(),
          phone: (item.phone || "").replace(/[^\d+]/g, "").replace(/(?!^)\+/g, ""),
          email: (item.email || "").trim(),
          channel: item.channel || ((item.email && !item.phone) ? "email" : "sms"),
          partySize: Number(item.partySize) || 1,
          status: "pending",
          token: window.Store.uid("t") + window.Store.uid(""),
          invitedAt: null,
          respondedAt: null,
          nudgeCount: 0,
          lastNudgeAt: null,
          createdAt: Date.now() + created.length,
        };
        db.guests[id] = g;
        created.push(g);
      }
      window.Store.save(db);
      return created;
    },
    async updateGuest(id, patch) {
      const db = window.Store.load();
      if (!db.guests[id]) throw new Error("Guest not found");
      Object.assign(db.guests[id], patch);
      window.Store.save(db);
      return db.guests[id];
    },
    async removeGuest(id) {
      const db = window.Store.load();
      delete db.guests[id];
      for (const m of Object.values(db.messages)) if (m.guestId === id) delete db.messages[m.id];
      window.Store.save(db);
    },

    /* Templates */
    async getTemplates(eventId) {
      const db = window.Store.load();
      const ev = db.events[eventId];
      return Object.assign({}, DEFAULT_TEMPLATES, (ev && ev.templates) || {});
    },
    async saveTemplates(eventId, templates) {
      const db = window.Store.load();
      if (!db.events[eventId]) throw new Error("Event not found");
      db.events[eventId].templates = Object.assign({}, DEFAULT_TEMPLATES, templates);
      window.Store.save(db);
      return db.events[eventId].templates;
    },
    async renderPreview(eventId, type, guest) {
      const db = window.Store.load();
      const ev = db.events[eventId];
      const tpl = (ev && ev.templates && ev.templates[type]) || DEFAULT_TEMPLATES[type];
      const sampleGuest = guest || { name: "Alex", token: "preview" };
      return render(tpl, { guest: sampleGuest, event: ev, host: db.host });
    },

    /* Messages */
    async listMessages(eventId, guestId) {
      const db = window.Store.load();
      return Object.values(db.messages)
        .filter((m) => m.eventId === eventId && (!guestId || m.guestId === guestId))
        .sort((a, b) => a.createdAt - b.createdAt);
    },
    async listActivity(limit = 40) {
      const db = window.Store.load();
      return Object.values(db.messages)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map((m) => ({
          ...m,
          guest: db.guests[m.guestId] || null,
          event: db.events[m.eventId] || null,
        }));
    },

    /* Pricing & billing */
    priceFor(guestCount) {
      const base = cfg.PRICE_BASE_CENTS;
      const per = cfg.PRICE_PER_GUEST_CENTS;
      const included = cfg.PRICE_BASE_INCLUDED || 0;
      const extra = Math.max(0, guestCount - included);
      return {
        base, per, guestCount, included, extra,
        perTotal: per * extra,
        totalCents: base + per * extra,
      };
    },
    async checkout(eventId) {
      // Phase 1: simulate a successful Stripe Checkout locally so the
      // pay-then-send flow is demoable. Phase 2 replaces this with a real
      // Stripe Checkout Session via the stripe-checkout Edge Function.
      const db = window.Store.load();
      const ev = db.events[eventId];
      if (!ev) throw new Error("Event not found");
      // Only host-added guests are billed — open-link joiners don't count.
      const count = countsFor(eventId, db).chargeable;
      ev.status = "active";
      ev.paidAt = Date.now();
      ev.guestCountAtPayment = count;
      window.Store.save(db);
      return { ok: true, simulated: true, event: decorateEvent(ev, db) };
    },

    /* Sending (Phase 1 logs the rendered SMS; Phase 2 sends via Twilio) */
    async sendInvites(eventId) {
      const db = window.Store.load();
      const ev = db.events[eventId];
      if (!ev) throw new Error("Event not found");
      if (!ev.paidAt) throw new Error("PAYMENT_REQUIRED");
      // Open-link joiners already RSVP'd on the page — never texted an invite.
      const gs = Object.values(db.guests).filter((g) => g.eventId === eventId && !g.invitedAt && !g.selfRegistered);
      const now = Date.now();
      let sent = 0;
      gs.forEach((g, i) => {
        const body = render(ev.templates.invite, { guest: g, event: ev, host: db.host });
        db.messages[window.Store.uid("m")] = {
          id: window.Store.uid("m"), eventId, guestId: g.id,
          direction: "out", kind: "invite", body, createdAt: now + i,
        };
        g.invitedAt = now + i;
        sent++;
      });
      window.Store.save(db);
      return { sent };
    },
    async sendNudge(guestId) {
      const db = window.Store.load();
      const g = db.guests[guestId];
      if (!g) throw new Error("Guest not found");
      const ev = db.events[g.eventId];
      const body = render(ev.templates.nudge, { guest: g, event: ev, host: db.host });
      const now = Date.now();
      db.messages[window.Store.uid("m")] = {
        id: window.Store.uid("m"), eventId: ev.id, guestId,
        direction: "out", kind: "nudge", body, createdAt: now,
      };
      g.nudgeCount = (g.nudgeCount || 0) + 1;
      g.lastNudgeAt = now;
      window.Store.save(db);
      return { ok: true };
    },

    /* RSVP response (from public page, or simulating an inbound SMS) */
    async recordRsvp(token, { status, partySize, note, answer, viaSms }) {
      const db = window.Store.load();
      const g = Object.values(db.guests).find((x) => x.token === token);
      if (!g) throw new Error("Invite not found");
      const ev = db.events[g.eventId];
      const now = Date.now();

      // Log the guest's reply as an inbound message (two-way thread).
      const inboundBody = viaSms
        ? (status === "confirmed" ? "YES" : "NO")
        : (status === "confirmed" ? "✅ Confirmed via RSVP page" : "🙅 Declined via RSVP page") +
          (note ? ` — “${note}”` : "") + (answer ? ` · answered: “${answer}”` : "");
      db.messages[window.Store.uid("m")] = {
        id: window.Store.uid("m"), eventId: ev.id, guestId: g.id,
        direction: "in", kind: "rsvp", body: inboundBody, createdAt: now,
      };

      g.status = status;
      g.respondedAt = now;
      if (status === "confirmed" && partySize) g.partySize = Number(partySize) || g.partySize;
      if (note) g.note = note;
      if (answer) g.answer = answer;

      // Auto-reply with the host's customised yes/no template.
      const tplKey = status === "confirmed" ? "replyYes" : "replyNo";
      const replyBody = render(ev.templates[tplKey], { guest: g, event: ev, host: db.host });
      db.messages[window.Store.uid("m")] = {
        id: window.Store.uid("m"), eventId: ev.id, guestId: g.id,
        direction: "out", kind: tplKey, body: replyBody, createdAt: now + 1,
      };

      window.Store.save(db);
      return { ok: true, autoReply: replyBody };
    },

    /* Blog — the live app reads posts from Supabase (fed by the blog-webhook).
       In this front-end preview we return one sample post so the layout and the
       "generate invites" banner are viewable without a backend. */
    async blogList() { return SAMPLE_POSTS.slice(); },
    async blogGet(slug) { return SAMPLE_POSTS.find((p) => p.slug === slug) || null; },
  };

  const SAMPLE_POSTS = [{
    slug: "how-to-get-guests-to-actually-rsvp",
    title: "How to get guests to actually RSVP (without nagging)",
    excerpt: "People love your party — they just forget to reply. Here's the simple system that turns “maybe” into a real headcount.",
    author: "The RSVPplease team",
    tags: ["Hosting", "RSVPs"],
    readMinutes: 4,
    publishedAt: "2026-07-01T09:00:00Z",
    coverImageUrl: "",
    metaTitle: "How to get guests to actually RSVP — RSVPplease",
    metaDescription: "The simple system that turns “maybe” into a real headcount — share a link, then let SMS nudges do the chasing.",
    bodyHtml: `
      <p>Every host knows the feeling: you send the invite, and then… silence. Not because people don't want to come — they just forget to reply.</p>
      <h2>Make replying effortless</h2>
      <p>The single biggest lever is friction. Give each guest a <strong>unique link</strong> they can tap once to say yes or no — no app, no account, no group-chat archaeology.</p>
      <ul><li>One tap to confirm</li><li>Works on any phone</li><li>Your headcount updates itself</li></ul>
      <h2>Then let the nudges do the chasing</h2>
      <p>For the stragglers, a friendly automated text does what you'd feel awkward doing yourself. Set it once and watch the “going” number climb.</p>
      <blockquote>Hosts using SMS nudges see replies roll in within hours — not the day before.</blockquote>
      <p>That's the whole system: share a link for free, and switch on SMS when you want a guaranteed headcount.</p>`,
  }];

  /* ---- Dispatcher ------------------------------------------------------ */
  // Phase 1 always routes to `local`. Phase 2 adds a `supabase` impl with the
  // same method names and switches here on cfg.BACKEND.
  const impl = cfg.BACKEND === "supabase" ? /* Phase 2 */ local : local;

  window.Api = Object.assign({}, impl, {
    TEMPLATE_TYPES, TEMPLATE_VARS, DEFAULT_TEMPLATES,
    fmtDate, render, rsvpLink,
    isBackendLive: () => cfg.BACKEND === "supabase",
  });
})();
