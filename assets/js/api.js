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
    const c = { total: gs.length, confirmed: 0, declined: 0, pending: 0, party: 0 };
    for (const g of gs) {
      if (g.status === "confirmed") { c.confirmed++; c.party += g.partySize || 1; }
      else if (g.status === "declined") c.declined++;
      else c.pending++;
    }
    return c;
  }

  function decorateEvent(ev, db) {
    return Object.assign({}, ev, { counts: countsFor(ev.id, db) });
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
    async signOut() {
      const db = window.Store.load();
      db.host = null; window.Store.save(db);
    },

    /* Events */
    async listEvents() {
      const db = window.Store.load();
      return Object.values(db.events)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .map((ev) => decorateEvent(ev, db));
    },
    async getEvent(id) {
      const db = window.Store.load();
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
        templates: Object.assign({}, DEFAULT_TEMPLATES),
        status: "draft",
        paidAt: null,
        guestCountAtPayment: 0,
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
      return { guest, event: db.events[guest.eventId] || null };
    },
    async addGuests(eventId, list) {
      const db = window.Store.load();
      const created = [];
      for (const item of list) {
        const id = window.Store.uid("g");
        const g = {
          id, eventId,
          name: (item.name || "").trim(),
          phone: (item.phone || "").trim(),
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
      const count = countsFor(eventId, db).total;
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
      const gs = Object.values(db.guests).filter((g) => g.eventId === eventId && !g.invitedAt);
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
    async recordRsvp(token, { status, partySize, note, viaSms }) {
      const db = window.Store.load();
      const g = Object.values(db.guests).find((x) => x.token === token);
      if (!g) throw new Error("Invite not found");
      const ev = db.events[g.eventId];
      const now = Date.now();

      // Log the guest's reply as an inbound message (two-way thread).
      const inboundBody = viaSms
        ? (status === "confirmed" ? "YES" : "NO")
        : (status === "confirmed" ? "✅ Confirmed via RSVP page" : "🙅 Declined via RSVP page") +
          (note ? ` — “${note}”` : "");
      db.messages[window.Store.uid("m")] = {
        id: window.Store.uid("m"), eventId: ev.id, guestId: g.id,
        direction: "in", kind: "rsvp", body: inboundBody, createdAt: now,
      };

      g.status = status;
      g.respondedAt = now;
      if (status === "confirmed" && partySize) g.partySize = Number(partySize) || g.partySize;
      if (note) g.note = note;

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
  };

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
