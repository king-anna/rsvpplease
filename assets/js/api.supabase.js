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
    // `chargeable` = host-added guests (self-registered open-link guests are
    // never texted, so never billed).
    const c = { total: gs.length, confirmed: 0, declined: 0, pending: 0, party: 0, chargeable: 0 };
    for (const g of gs) {
      if (g.status === "confirmed") { c.confirmed++; c.party += g.party_size || 1; }
      else if (g.status === "declined") c.declined++;
      else c.pending++;
      if (!g.self_registered) c.chargeable++;
    }
    return c;
  }
  const evFromRow = (r) => ({
    id: r.id, hostId: r.host_id, name: r.name, description: r.description || "",
    date: r.event_date || "", location: r.location || "", rsvpDeadline: r.rsvp_deadline || "",
    coverImageUrl: r.cover_image_url || "", nudgeAfterHours: r.nudge_after_hours,
    nudgeMax: r.nudge_max, status: r.status, paidAt: ts(r.paid_at),
    guestCountAtPayment: r.guest_count_at_payment, archived: !!r.archived,
    theme: r.theme || "confetti", palette: r.palette || "blush",
    spots: r.spots || null, allowPlusOne: r.allow_plus_one !== false,
    titleFont: r.title_font || null, effectEmoji: r.effect_emoji || "",
    extras: r.extras || {}, guestQuestion: r.guest_question || "",
    hideAddress: !!r.hide_address, showGuests: !!r.show_guests,
    openToken: r.open_token || "",
    createdAt: ts(r.created_at) || 0,
    counts: countsFromGuests(r.guests),
  });
  // Guest-page event shape shared by rsvp_get and rsvp_open_get payloads.
  const rpcEvent = (ev) => ({
    name: ev.name, description: ev.description || "", date: ev.event_date || "",
    location: ev.location || "", locationHidden: !!ev.location_hidden,
    hostName: ev.host_name || "your host", coverImageUrl: ev.cover_image_url || "",
    theme: ev.theme || "confetti", palette: ev.palette || "blush",
    spots: ev.spots || null, allowPlusOne: ev.allow_plus_one !== false,
    titleFont: ev.title_font || null, effectEmoji: ev.effect_emoji || "",
    extras: ev.extras || {}, guestQuestion: ev.guest_question || "",
    showGuests: !!ev.show_guests,
    goingCount: ev.going_count == null ? null : Number(ev.going_count),
    goingNames: Array.isArray(ev.going_names) ? ev.going_names : [],
    activity: Array.isArray(ev.activity)
      ? ev.activity.map((a) => ({ name: a.name || "A guest", status: a.status, note: a.note || "", gif: a.gif || "", at: ts(a.at) }))
      : [],
    photos: Array.isArray(ev.photos) ? ev.photos.map((p) => ({ id: p.id, url: p.url })) : null,
  });
  const guestFromRow = (g) => ({
    id: g.id, eventId: g.event_id, name: g.name || "", phone: g.phone || "",
    email: g.email || "", channel: g.channel || "sms", partySize: g.party_size || 1,
    status: g.status || "pending", token: g.token, note: g.note || "", answer: g.answer || "",
    gifUrl: g.gif_url || "", selfRegistered: !!g.self_registered,
    invitedAt: ts(g.invited_at), respondedAt: ts(g.responded_at),
    nudgeCount: g.nudge_count || 0, lastNudgeAt: ts(g.last_nudge_at), createdAt: ts(g.created_at) || 0,
  });
  const msgFromRow = (m) => ({
    id: m.id, eventId: m.event_id, guestId: m.guest_id, channel: m.channel,
    direction: m.direction, kind: m.kind, subject: m.subject, body: m.body, createdAt: ts(m.created_at) || 0,
  });
  const postFromRow = (p) => ({
    slug: p.slug, title: p.title, excerpt: p.excerpt || "", bodyHtml: p.body_html || "",
    coverImageUrl: p.cover_image_url || "", author: p.author || "", tags: p.tags || [],
    metaTitle: p.meta_title || "", metaDescription: p.meta_description || "",
    readMinutes: p.read_minutes || 3, publishedAt: p.published_at || "",
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
    // Magic-link / OTP sign-in (passwordless fallback + how accounts without a
    // password yet get in).
    async signIn({ name, email }) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { data: { name }, emailRedirectTo: location.origin + location.pathname },
      });
      if (error) throw error;
      return { pending: true, email };
    },
    // Everyday sign-in with a password.
    async signInPassword({ email, password }) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { ok: true, session: data.session };
    },
    // Create an account with a password. With email-confirmation on, no session
    // is returned until the user confirms via email → caller shows "check inbox".
    async signUpPassword({ name, email, password }) {
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { name }, emailRedirectTo: location.origin + location.pathname },
      });
      if (error) throw error;
      return { ok: true, session: data.session, needsConfirm: !data.session };
    },
    async resetPassword(email) {
      // No hash in redirectTo — Supabase appends the recovery token to the hash,
      // and onAuthStateChange(PASSWORD_RECOVERY) routes to the set-password view.
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + location.pathname,
      });
      if (error) throw error;
      return { pending: true, email };
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      return { ok: true };
    },
    async signOut() { await sb.auth.signOut(); },

    /* Events */
    async listEvents() {
      const { data, error } = await sb.from("events")
        .select("*, guests(status, party_size, self_registered)").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(evFromRow);
    },
    async getEvent(id) {
      const { data, error } = await sb.from("events")
        .select("*, guests(status, party_size, self_registered)").eq("id", id).maybeSingle();
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
        theme: d.theme || "confetti", palette: d.palette || "blush",
        spots: Number(d.spots) || 40, allow_plus_one: d.allowPlusOne !== false,
        cover_image_url: d.coverImageUrl || null,
        title_font: d.titleFont || null, effect_emoji: d.effectEmoji || null,
        extras: d.extras || {}, guest_question: d.guestQuestion || null,
        hide_address: !!d.hideAddress, show_guests: !!d.showGuests,
      };
      const { data, error } = await sb.from("events").insert(row).select("*").single();
      if (error) throw error;
      return evFromRow({ ...data, guests: [] });
    },
    async updateEvent(id, p) {
      const row = {};
      const map = { name: "name", description: "description", date: "event_date", location: "location",
        rsvpDeadline: "rsvp_deadline", nudgeAfterHours: "nudge_after_hours", nudgeMax: "nudge_max",
        status: "status", coverImageUrl: "cover_image_url", archived: "archived",
        theme: "theme", palette: "palette", spots: "spots", allowPlusOne: "allow_plus_one",
        titleFont: "title_font", effectEmoji: "effect_emoji", extras: "extras",
        guestQuestion: "guest_question", hideAddress: "hide_address", showGuests: "show_guests" };
      for (const k in map) if (k in p) row[map[k]] = (p[k] === "" && /date|deadline/i.test(k)) ? null : p[k];
      const { data, error } = await sb.from("events").update(row).eq("id", id)
        .select("*, guests(status, party_size, self_registered)").single();
      if (error) throw error;
      return evFromRow(data);
    },
    async deleteEvent(id) { const { error } = await sb.from("events").delete().eq("id", id); if (error) throw error; },

    // Cover photo → public 'covers' bucket; returns the public URL to store on the event.
    async uploadCover(file) {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Sign in first");
      const ext = (file.name || "img.jpg").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from("covers").upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" });
      if (error) throw error;
      return sb.storage.from("covers").getPublicUrl(path).data.publicUrl;
    },

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
        guest: { name: g.name, partySize: g.party_size, status: g.status, respondedAt: ts(g.responded_at),
          answer: g.answer || "", gifUrl: g.gif_url || "", token },
        event: rpcEvent(ev),
      };
    },
    async getOpenInvite(openToken) {
      const { data, error } = await sb.rpc("rsvp_open_get", { p_open_token: openToken });
      if (error || !data || !data.event) return null;
      return { event: rpcEvent(data.event) };
    },
    async openRsvp(openToken, { name, phone, status, partySize, note, answer, hp, gif }) {
      const { data, error } = await sb.rpc("rsvp_open_submit", {
        p_open_token: openToken, p_name: name, p_phone: phone, p_status: status,
        p_party: partySize ? Number(partySize) : null, p_note: note || null,
        p_answer: answer || null, p_hp: hp || null, p_gif: gif || null,
      });
      if (error) throw error;
      if (data && data.token) sb.functions.invoke("notify-host", { body: { token: data.token } }).catch(() => {});
      return { ok: true, token: (data && data.token) || null, autoReply: (data && data.auto_reply) || "" };
    },
    async addGuests(id, list) {
      // Normalise phones to E.164-ish (strip spaces/()/- ) so outbound SMS and
      // inbound matching both work; keep a leading +.
      const normPhone = (p) => (p || "").replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "") || null;
      const rows = list.map((it) => ({
        event_id: id, name: (it.name || "").trim(),
        phone: normPhone(it.phone), email: (it.email || "").trim() || null,
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
      // Already paid and the new guests are still within the base allowance —
      // nothing to charge; the caller sends the new invites directly.
      if (data && data.nothing_owed) return { ok: true, nothingOwed: true };
      if (data && data.url) { window.location.href = data.url; return { ok: true, redirect: true }; }
      throw new Error((data && data.error) || "Checkout could not start");
    },
    async sendInvites(id) {
      const { data, error } = await sb.functions.invoke("send-invites", { body: { event_id: id } });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      return { sent: (data && data.sent) || 0, errors: (data && data.errors) || [] };
    },
    async sendNudge(gid) {
      const { error } = await sb.functions.invoke("send-nudges", { body: { guest_id: gid } });
      if (error) throw error;
      return { ok: true };
    },
    async recordRsvp(token, { status, partySize, note, answer, gif }) {
      const { data, error } = await sb.rpc("rsvp_submit", {
        p_token: token, p_status: status, p_party: partySize ? Number(partySize) : null, p_note: note || null,
        p_answer: answer || null, p_gif: gif || null,
      });
      if (error) throw error;
      sb.functions.invoke("notify-host", { body: { token } }).catch(() => {});
      return { ok: true, autoReply: (data && data.auto_reply) || "" };
    },

    /* Media (Phase 3) */
    async gifSearch(q) {
      const { data, error } = await sb.functions.invoke("gif-search", { body: { q: q || "" } });
      if (error || !data || !Array.isArray(data.gifs)) return [];
      return data.gifs;
    },
    async uploadPartyPhoto(token, dataUrl) {
      const { data, error } = await sb.functions.invoke("photo-upload", { body: { token, data: dataUrl } });
      if (error) throw new Error("Upload failed — try a smaller photo");
      if (data && data.error) throw new Error(data.error);
      return { id: data.id, url: data.url };
    },
    async hostPhotos(eventId) {
      const { data, error } = await sb.from("photos").select("*")
        .eq("event_id", eventId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((p) => ({ id: p.id, eventId: p.event_id, guestId: p.guest_id, url: p.url, createdAt: ts(p.created_at) }));
    },
    async deletePhoto(id) {
      const { data, error } = await sb.functions.invoke("photo-delete", { body: { id } });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      return { ok: true };
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

    /* Blog (public reads; posts are written by the blog-webhook Edge Function) */
    async blogList() {
      const { data, error } = await sb.from("posts")
        .select("slug,title,excerpt,cover_image_url,author,tags,read_minutes,published_at")
        .eq("published", true).order("published_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(postFromRow);
    },
    async blogGet(slug) {
      const { data, error } = await sb.from("posts")
        .select("*").eq("slug", slug).eq("published", true).maybeSingle();
      if (error) throw error;
      return data ? postFromRow(data) : null;
    },
  };

  Object.assign(window.Api, impl);
  // Re-render when the magic-link session resolves on return. A password-reset
  // link lands with a recovery session → route to the set-new-password screen.
  sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") { window.__rsvpRecovery = true; location.hash = "#/reset"; }
    if (window.__rsvpRender) window.__rsvpRender();
  });
})();
