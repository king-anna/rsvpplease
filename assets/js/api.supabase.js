/* =========================================================================
   RSVPplease — Supabase implementation of the api.js seam (Phase 2)
   -------------------------------------------------------------------------
   Loads AFTER api.js. When RSVP_CONFIG.BACKEND === "supabase" it overrides the
   localStorage data methods on window.Api with Supabase-backed ones — the views
   in app.js / rsvp.js are untouched. Pure helpers (render, fmtDate, rsvpLink,
   priceFor, DEFAULT_TEMPLATES, TEMPLATE_TYPES…) stay as defined in api.js.

   Activate only AFTER the schema migration (supabase/migrations/0001_init.sql)
   has been run on the project, then set BACKEND:"supabase" in config.js.
   ========================================================================= */
(function () {
  const cfg = window.RSVP_CONFIG;
  if (cfg.BACKEND !== "supabase") return;               // local mode: no-op
  if (!window.supabase) { console.error("[RSVPplease] supabase-js not loaded"); return; }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  /* ---- row <-> view-shape mapping ------------------------------------- */
  const ts = (s) => (s ? Date.parse(s) : null);

  function countsFromGuests(gs) {
    gs = gs || [];
    const c = { total: gs.length, confirmed: 0, declined: 0, pending: 0, party: 0 };
    for (const g of gs) {
      if (g.status === "confirmed") { c.confirmed++; c.party += g.party_size || 1; }
      else if (g.status === "declined") c.declined++;
      else c.pending++;
    }
    return c;
  }
  const evFromRow = (r) => ({
    id: r.id, hostId: r.host_id, name: r.name, description: r.description || "",
    date: r.event_date || "", location: r.location || "", rsvpDeadline: r.rsvp_deadline || "",
    coverImageUrl: r.cover_image_url || "", nudgeAfterHours: r.nudge_after_hours,
    nudgeMax: r.nudge_max, status: r.status, paidAt: ts(r.paid_at),
    guestCountAtPayment: r.guest_count_at_payment, createdAt: ts(r.created_at) || 0,
    counts: countsFromGuests(r.guests),
  });
  const guestFromRow = (g) => ({
    id: g.id, eventId: g.event_id, name: g.name || "", phone: g.phone || "",
    email: g.email || "", channel: g.channel || "sms", partySize: g.party_size || 1,
    status: g.status || "pending", token: g.token, note: g.note || "",
    invitedAt: ts(g.invited_at), respondedAt: ts(g.responded_at),
    nudgeCount: g.nudge_count || 0, lastNudgeAt: ts(g.last_nudge_at), createdAt: ts(g.created_at) || 0,
  });
  const msgFromRow = (m) => ({
    id: m.id, eventId: m.event_id, guestId: m.guest_id, channel: m.channel,
    direction: m.direction, kind: m.kind, subject: m.subject, body: m.body, createdAt: ts(m.created_at) || 0,
  });

  /* ---- the Supabase impl ---------------------------------------------- */
  const impl = {
    /* Auth (magic-link / OTP) */
    async getHost() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      const { data: p } = await sb.from("profiles").select("role, comped, full_name").eq("id", user.id).maybeSingle();
      return {
        id: user.id, email: user.email,
        name: (p && p.full_name) || user.user_metadata?.name || user.email,
        role: (p && p.role) || "host",
        comped: !!(p && p.comped),
      };
    },
    async signIn({ name, email }) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { data: { name }, emailRedirectTo: location.origin + location.pathname },
      });
      if (error) throw error;
      return { pending: true, email };
    },
    async signOut() { await sb.auth.signOut(); },

    /* Events */
    async listEvents() {
      const { data, error } = await sb.from("events")
        .select("*, guests(status, party_size)").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(evFromRow);
    },
    async getEvent(id) {
      const { data, error } = await sb.from("events")
        .select("*, guests(status, party_size)").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? evFromRow(data) : null;
    },
    async createEvent(d) {
      const { data: { user } } = await sb.auth.getUser();
      const row = {
        host_id: user.id, name: d.name || "Untitled event", description: d.description || "",
        event_date: d.date || null, location: d.location || "", rsvp_deadline: d.rsvpDeadline || null,
        nudge_after_hours: Number(d.nudgeAfterHours) || cfg.DEFAULT_NUDGE_AFTER_HOURS,
        nudge_max: Number(d.nudgeMax) || cfg.DEFAULT_NUDGE_MAX,
      };
      const { data, error } = await sb.from("events").insert(row).select("*").single();
      if (error) throw error;
      return evFromRow({ ...data, guests: [] });
    },
    async updateEvent(id, p) {
      const row = {};
      const map = { name: "name", description: "description", date: "event_date", location: "location",
        rsvpDeadline: "rsvp_deadline", nudgeAfterHours: "nudge_after_hours", nudgeMax: "nudge_max",
        status: "status", coverImageUrl: "cover_image_url" };
      for (const k in map) if (k in p) row[map[k]] = (p[k] === "" && /date|deadline/i.test(k)) ? null : p[k];
      const { data, error } = await sb.from("events").update(row).eq("id", id)
        .select("*, guests(status, party_size)").single();
      if (error) throw error;
      return evFromRow(data);
    },
    async deleteEvent(id) { const { error } = await sb.from("events").delete().eq("id", id); if (error) throw error; },

    /* Guests */
    async listGuests(id) {
      const { data, error } = await sb.from("guests").select("*").eq("event_id", id).order("created_at");
      if (error) throw error;
      return (data || []).map(guestFromRow);
    },
    async getGuestByToken(token) {
      const { data, error } = await sb.rpc("rsvp_get", { p_token: token });
      if (error || !data || !data.event) return null;
      const ev = data.event, g = data.guest;
      return {
        guest: { name: g.name, partySize: g.party_size, status: g.status, respondedAt: ts(g.responded_at), token },
        event: { name: ev.name, description: ev.description || "", date: ev.event_date || "",
          location: ev.location || "", hostName: ev.host_name || "your host", coverImageUrl: ev.cover_image_url || "" },
      };
    },
    async addGuests(id, list) {
      const rows = list.map((it) => ({
        event_id: id, name: (it.name || "").trim(),
        phone: (it.phone || "").trim() || null, email: (it.email || "").trim() || null,
        channel: it.channel || (it.email && !it.phone ? "email" : "sms"),
        party_size: Number(it.partySize) || 1,
      }));
      const { data, error } = await sb.from("guests").insert(rows).select("*");
      if (error) throw error;
      return (data || []).map(guestFromRow);
    },
    async updateGuest(id, p) {
      const row = {};
      const map = { name: "name", phone: "phone", email: "email", channel: "channel",
        partySize: "party_size", status: "status", note: "note" };
      for (const k in map) if (k in p) row[map[k]] = p[k];
      const { data, error } = await sb.from("guests").update(row).eq("id", id).select("*").single();
      if (error) throw error;
      return guestFromRow(data);
    },
    async removeGuest(id) { const { error } = await sb.from("guests").delete().eq("id", id); if (error) throw error; },

    /* Templates (SMS object lives under data.sms; email uses server defaults) */
    async getTemplates(id) {
      const { data } = await sb.from("templates").select("data").eq("event_id", id).maybeSingle();
      const sms = (data && data.data && data.data.sms) || {};
      return Object.assign({}, window.Api.DEFAULT_TEMPLATES, sms);
    },
    async saveTemplates(id, t) {
      const { data: existing } = await sb.from("templates").select("data").eq("event_id", id).maybeSingle();
      const merged = Object.assign({}, (existing && existing.data) || {});
      merged.sms = Object.assign({}, window.Api.DEFAULT_TEMPLATES, t);
      const { error } = await sb.from("templates")
        .upsert({ event_id: id, data: merged, updated_at: new Date().toISOString() });
      if (error) throw error;
      return merged.sms;
    },
    async renderPreview(id, type, guest) {
      const ev = await this.getEvent(id);
      const t = await this.getTemplates(id);
      const host = await this.getHost();
      return window.Api.render(t[type], { guest: guest || { name: "Alex", token: "preview" }, event: ev, host });
    },

    /* Messages */
    async listMessages(id, gid) {
      let q = sb.from("messages").select("*").eq("event_id", id).order("created_at");
      if (gid) q = q.eq("guest_id", gid);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(msgFromRow);
    },
    async listActivity(limit = 40) {
      const { data, error } = await sb.from("messages")
        .select("*, guests(name), events(name)").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data || []).map((m) => ({
        ...msgFromRow(m),
        guest: m.guests ? { name: m.guests.name } : null,
        event: m.events ? { name: m.events.name } : null,
      }));
    },

    /* Billing & sending (via Edge Functions) */
    async checkout(id) {
      const { data, error } = await sb.functions.invoke("stripe-checkout", { body: { event_id: id } });
      if (error) throw error;
      if (data && data.url) { window.location.href = data.url; return { ok: true, redirect: true }; }
      throw new Error((data && data.error) || "Checkout could not start");
    },
    async sendInvites(id) {
      const { data, error } = await sb.functions.invoke("send-invites", { body: { event_id: id } });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      return { sent: (data && data.sent) || 0 };
    },
    async sendNudge(gid) {
      const { error } = await sb.functions.invoke("send-nudges", { body: { guest_id: gid } });
      if (error) throw error;
      return { ok: true };
    },
    async recordRsvp(token, { status, partySize, note }) {
      const { data, error } = await sb.rpc("rsvp_submit", {
        p_token: token, p_status: status, p_party: partySize ? Number(partySize) : null, p_note: note || null,
      });
      if (error) throw error;
      sb.functions.invoke("notify-host", { body: { token } }).catch(() => {});
      return { ok: true, autoReply: (data && data.auto_reply) || "" };
    },

    /* Admin */
    async adminOverview() {
      const { data, error } = await sb.rpc("admin_overview");
      if (error) throw error;
      return (data || []).map((r) => ({
        userId: r.user_id, email: r.email, name: r.full_name, role: r.role, comped: r.comped,
        events: Number(r.events) || 0, guests: Number(r.guests) || 0,
        totalPaidCents: Number(r.total_paid_cents) || 0, joined: ts(r.joined),
      }));
    },
    async adminSetComped(userId, value) {
      const { error } = await sb.rpc("admin_set_comped", { target: userId, value });
      if (error) throw error;
      return { ok: true };
    },
  };

  Object.assign(window.Api, impl);
  // Re-render when the magic-link session resolves on return.
  sb.auth.onAuthStateChange(() => { if (window.__rsvpRender) window.__rsvpRender(); });
})();
