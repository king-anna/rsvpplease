/* =========================================================================
   RSVPplease — host dashboard SPA
   Hash router + views. All data flows through window.Api (the seam), so
   nothing here changes when the Supabase backend is wired in Phase 2.
   ========================================================================= */
(function () {
  const { esc, el, icon, initials, money, relTime, toast, modal, confirmDialog, copy } = window.UI;
  const app = document.getElementById("app");
  let host = null;

  const go = (hash) => { window.location.hash = hash; };
  const fmt = window.Api.fmtDate;

  /* ---- Status helpers -------------------------------------------------- */
  function statusPill(status) {
    if (status === "confirmed") return `<span class="pill ok"><span class="dot"></span>Confirmed</span>`;
    if (status === "declined") return `<span class="pill no"><span class="dot"></span>Declined</span>`;
    return `<span class="pill wait"><span class="dot"></span>Awaiting</span>`;
  }

  function dateChip(iso) {
    const d = iso ? new Date(iso) : null;
    const m = d && !isNaN(d) ? d.toLocaleDateString(undefined, { month: "short" }) : "—";
    const day = d && !isNaN(d) ? d.getDate() : "·";
    return `<span class="date-chip"><span class="m">${esc(m)}</span><span class="d">${esc(day)}</span></span>`;
  }

  /* ---- Shell ----------------------------------------------------------- */
  function shell(active, content) {
    const a = (route, label, ic) =>
      `<a href="#/${route}" class="${active === route ? "active" : ""}">${icon(ic)} ${label}</a>`;
    return `
      <header class="topbar">
        <div class="container">
          <a href="#/events" class="wordmark" style="text-decoration:none">
            RSVP<b>please</b><span class="dot">.</span>
          </a>
          <span class="pill rose" title="Phase 1 — front-end preview using your own local data">front-end preview</span>
          <nav class="nav">
            ${a("events", "Events", "calendar")}
            ${a("inbox", "Activity", "inbox")}
          </nav>
          <span class="spacer"></span>
          <div class="avatar" id="avatar" title="${esc(host ? host.name : "")}">${esc(initials(host && host.name))}</div>
        </div>
      </header>
      <main class="container page">${content}</main>`;
  }

  function mount(active, content) {
    app.innerHTML = shell(active, content);
    const av = document.getElementById("avatar");
    if (av) av.addEventListener("click", openProfile);
  }

  function openProfile() {
    modal({
      title: "Your account",
      body: `
        <div class="field"><span class="label">Name</span><input class="input" id="pf-name" value="${esc(host.name)}"></div>
        <div class="field"><span class="label">Email</span><input class="input" id="pf-email" value="${esc(host.email)}"></div>
        <p class="help">In Phase 2 this becomes a Supabase Auth account (magic-link sign-in).</p>`,
      actions: [
        { label: "Sign out", cls: "ghost", onClick: async (c) => { await window.Api.signOut(); c(); location.hash = "#/"; render(); } },
        { label: "Save", cls: "primary", onClick: async (c) => {
            host = await window.Api.signIn({ name: val("pf-name"), email: val("pf-email") });
            c(); render(); toast("Saved", "ok");
        } },
      ],
    });
  }

  const val = (id) => (document.getElementById(id)?.value || "").trim();

  /* ===================================================================== */
  /*  LANDING (marketing — shown at the root for signed-out visitors)      */
  /* ===================================================================== */
  function feat(ic, title, body) {
    return `<div class="lp-feature"><div class="fi">${icon(ic)}</div>
      <div><h3>${esc(title)}</h3><p>${esc(body)}</p></div></div>`;
  }

  function viewLanding() {
    const sample = window.Api.render(window.Api.DEFAULT_TEMPLATES.invite, {
      guest: { name: "Alex", token: "demo" },
      event: { name: "Mara & Theo's Garden Party", date: "2026-07-18T17:30", location: "Brooklyn" },
      host: { name: "Mara" },
    });
    app.innerHTML = `
      <div class="lp">
        <nav class="lp-nav"><div class="container">
          <a href="#/" class="wordmark" style="text-decoration:none">RSVP<b>please</b><span class="dot">.</span></a>
          <span class="spacer"></span>
          <button class="btn ghost" data-signin>Sign in</button>
          <button class="btn primary" data-start>Get started</button>
        </div></nav>

        <header class="lp-hero"><div class="container">
          <span class="eyebrow">SMS &amp; email RSVPs</span>
          <h1 class="lp-title">The RSVPs <span class="accent">chase themselves.</span></h1>
          <p class="lp-sub">Send each guest a personal RSVP link by text or email, watch confirmations
            roll in, and let RSVPplease automatically nudge whoever hasn't replied.</p>
          <div class="lp-cta-row">
            <button class="btn primary lg" data-start>${icon("heart")} Start planning</button>
            <button class="btn lg" data-signin>I have an account</button>
          </div>
          <p class="lp-trust">No subscription · $10 for up to 10 guests · pay only when you send</p>
          <div class="lp-hero-art">
            <div class="phone"><div class="notch"></div><div class="screen">
              <div class="bar">RSVPplease</div>
              <div class="bubble out">${esc(sample)}<div class="meta">Sent · just now</div></div>
              <div class="bubble">YES 🎉<div class="meta">Received</div></div>
              <div class="bubble out">Yay! So happy you'll be joining. See you there! 💕<div class="meta">Auto-reply</div></div>
            </div></div>
          </div>
        </div></header>

        <section class="lp-section tint"><div class="container">
          <div class="lp-head"><h2>How it works</h2><p>Three steps from guest list to a full count.</p></div>
          <div class="lp-steps">
            <div class="lp-step"><div class="num">1</div><h3>Add your guests</h3>
              <p>Name + mobile or email. Paste a whole list at once — phones and emails sort themselves.</p></div>
            <div class="lp-step"><div class="num">2</div><h3>We send the invites</h3>
              <p>Each guest gets a unique RSVP link by text and/or email, in your words. Pay $10 and they're off.</p></div>
            <div class="lp-step"><div class="num">3</div><h3>Replies + auto-nudges</h3>
              <p>Track confirmed / declined live. Anyone who goes quiet gets a gentle follow-up, automatically.</p></div>
          </div>
        </div></section>

        <section class="lp-section"><div class="container">
          <div class="lp-head"><h2>Everything an invite needs</h2></div>
          <div class="lp-features">
            ${feat("chat", "Two-way texting", "Guests reply YES/NO in the thread — we update the count and auto-respond.")}
            ${feat("inbox", "Email too", "Prefer email? Invite, nudge and confirm over email — chosen per guest.")}
            ${feat("bell", "Auto follow-up", "Set it once: nudge non-responders after N hours, up to your limit. No chasing.")}
            ${feat("sliders", "Your words", "Customise the invite, nudge and yes/no replies, with a live preview as you type.")}
          </div>
        </div></section>

        <section class="lp-section tint"><div class="container">
          <div class="lp-head"><h2>Simple pricing</h2><p>Pay per event, only when you send. No subscription.</p></div>
          <div class="lp-price-card ticket">
            <div class="lp-price-amt">$10<small> / event</small></div>
            <p class="muted mt-8">covers up to 10 guests</p>
            <ul>
              <li><span class="ck">${icon("check")}</span> Up to 10 guests included</li>
              <li><span class="ck">${icon("check")}</span> +$1 per extra guest</li>
              <li><span class="ck">${icon("check")}</span> SMS &amp; email invites</li>
              <li><span class="ck">${icon("check")}</span> Auto-nudges &amp; two-way replies</li>
            </ul>
            <button class="btn primary block lg" data-start>Get started</button>
          </div>
        </div></section>

        <footer class="lp-foot"><div class="container">
          <a href="#/" class="wordmark" style="text-decoration:none;font-size:1rem">RSVP<b>please</b><span class="dot">.</span></a>
          <p class="mt-16">Invitations that chase the replies for you.</p>
        </div></footer>
      </div>`;
    app.querySelectorAll("[data-start],[data-signin]").forEach((b) =>
      b.addEventListener("click", () => go("#/signin")));
  }

  function showCheckEmail(email) {
    app.innerHTML = `
      <div class="auth-wrap"><div class="card auth-card ticket text-c reveal">
        <div style="width:60px;margin:4px auto 14px;color:var(--rose)">${icon("inbox", "")}</div>
        <h2>Check your inbox</h2>
        <p class="muted mt-8">We sent a magic sign-in link to <b>${esc(email)}</b>.
          Open it on this device and you'll land right back here.</p>
      </div></div>`;
  }

  /* ===================================================================== */
  /*  AUTH                                                                  */
  /* ===================================================================== */
  function viewAuth() {
    app.innerHTML = `
      <div class="auth-wrap">
        <div class="card auth-card ticket reveal">
          <div class="text-c mb-24">
            <a href="#/" class="wordmark" style="font-size:2rem;text-decoration:none">RSVP<b>please</b><span class="dot">.</span></a>
            <p class="muted mt-8">Invitations that chase the replies for you.</p>
          </div>
          <div class="field mb-16"><span class="label">Your name</span>
            <input class="input" id="au-name" placeholder="e.g. Mara Daly" autocomplete="name"></div>
          <div class="field mb-24"><span class="label">Email</span>
            <input class="input" id="au-email" type="email" placeholder="you@email.com" autocomplete="email"></div>
          <button class="btn primary block lg" id="au-go">Start planning ${icon("heart")}</button>
          <p class="help text-c mt-16">No password yet — Phase 2 adds Supabase magic-link sign-in.</p>
        </div>
      </div>`;
    const submit = async () => {
      const name = val("au-name"), email = val("au-email");
      if (!name) return toast("Add your name to continue", "err");
      if (window.Api.isBackendLive() && !email) return toast("Add your email — we'll send a magic link", "err");
      try {
        const res = await window.Api.signIn({ name, email });
        if (res && res.pending) return showCheckEmail(res.email);
        host = res; go("#/events"); render();
      } catch (e) { toast(e.message || "Sign-in failed", "err"); }
    };
    document.getElementById("au-go").addEventListener("click", submit);
    app.querySelectorAll("input").forEach((i) =>
      i.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); }));
  }

  /* ===================================================================== */
  /*  EVENTS LIST                                                           */
  /* ===================================================================== */
  async function viewEvents() {
    const events = await window.Api.listEvents();
    let body;
    if (!events.length) {
      body = `
        <div class="card flat empty reveal">
          <div class="art">${icon("calendar", "")}</div>
          <h3>No events yet</h3>
          <p>Create your first event, add guests, and let RSVPplease send the invites and chase the stragglers by text.</p>
          <button class="btn primary lg" data-new>${icon("plus")} New event</button>
        </div>`;
    } else {
      body = `<div class="event-grid">${events.map(eventCard).join("")}</div>`;
    }
    mount("events", `
      <div class="page-head">
        <div>
          <div class="eyebrow">Dashboard</div>
          <h1>Your events</h1>
        </div>
        <button class="btn primary" data-new>${icon("plus")} New event</button>
      </div>
      ${body}`);
    app.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => go("#/new")));
    app.querySelectorAll("[data-ev]").forEach((c) =>
      c.addEventListener("click", () => go("#/event/" + c.dataset.ev)));
  }

  function eventCard(ev) {
    const c = ev.counts;
    const replied = c.confirmed + c.declined;
    const pct = c.total ? Math.round((replied / c.total) * 100) : 0;
    const okW = c.total ? (c.confirmed / c.total) * 100 : 0;
    const noW = c.total ? (c.declined / c.total) * 100 : 0;
    const statusTag = ev.paidAt
      ? `<span class="pill ok"><span class="dot"></span>Sending</span>`
      : `<span class="pill"><span class="dot"></span>Draft</span>`;
    return `
      <button class="event-card reveal" data-ev="${ev.id}">
        <div class="row between" style="align-items:flex-start">
          ${dateChip(ev.date)}
          ${statusTag}
        </div>
        <h3 class="mt-16">${esc(ev.name)}</h3>
        <p class="muted" style="font-size:.88rem;min-height:1.2em">
          ${ev.location ? icon("location") + " " + esc(ev.location) : "&nbsp;"}
        </p>
        <div class="mt-16">
          <div class="progress"><i class="ok" style="width:${okW}%"></i><i class="no" style="width:${noW}%"></i></div>
          <div class="row between mt-8" style="font-size:.82rem">
            <span class="muted tabular">${replied} of ${c.total} replied · ${pct}%</span>
            <span class="pill ok" style="font-size:.7rem">${c.confirmed} yes</span>
          </div>
        </div>
      </button>`;
  }

  /* ===================================================================== */
  /*  CREATE / EDIT EVENT                                                   */
  /* ===================================================================== */
  async function viewEventForm(id) {
    const ev = id ? await window.Api.getEvent(id) : null;
    const v = (k, d = "") => esc(ev ? (ev[k] ?? d) : d);
    mount("events", `
      <button class="crumb" data-back>${icon("chevronLeft")} ${id ? "Back to event" : "All events"}</button>
      <div class="page-head"><div>
        <div class="eyebrow">${id ? "Edit" : "Create"}</div>
        <h1>${id ? "Edit event" : "New event"}</h1>
      </div></div>
      <div class="card reveal" style="max-width:680px">
        <div class="field mb-16"><span class="label">Event name</span>
          <input class="input" id="f-name" placeholder="Mara & Theo's Garden Party" value="${v("name")}"></div>
        <div class="field-row mb-16">
          <div class="field"><span class="label">Date &amp; time</span>
            <input class="input" id="f-date" type="datetime-local" value="${v("date")}"></div>
          <div class="field"><span class="label">RSVP deadline</span>
            <input class="input" id="f-deadline" type="date" value="${v("rsvpDeadline")}"></div>
        </div>
        <div class="field mb-16"><span class="label">Location</span>
          <input class="input" id="f-loc" placeholder="14 Rosewood Lane, Brooklyn" value="${v("location")}"></div>
        <div class="field mb-16"><span class="label">A note for guests <span class="faint">(optional)</span></span>
          <textarea class="textarea" id="f-desc" placeholder="Drinks, dinner & dancing — dress code is garden chic.">${v("description")}</textarea></div>
        <div class="field-row mb-24">
          <div class="field"><span class="label">Auto-nudge after</span>
            <select class="input" id="f-nudgeh">
              ${[24, 48, 72, 96].map((h) => `<option value="${h}" ${ev && ev.nudgeAfterHours === h ? "selected" : ""}>${h} hours of no reply</option>`).join("")}
            </select></div>
          <div class="field"><span class="label">Max nudges per guest</span>
            <select class="input" id="f-nudgem">
              ${[1, 2, 3].map((n) => `<option value="${n}" ${ev && ev.nudgeMax === n ? "selected" : ""}>${n}</option>`).join("")}
            </select></div>
        </div>
        <div class="row gap-12">
          <button class="btn primary lg" id="f-save">${icon("check")} ${id ? "Save changes" : "Create event"}</button>
          <button class="btn ghost" data-back>Cancel</button>
        </div>
      </div>`);
    app.querySelectorAll("[data-back]").forEach((b) =>
      b.addEventListener("click", () => go(id ? "#/event/" + id : "#/events")));
    document.getElementById("f-save").addEventListener("click", async () => {
      const data = {
        name: val("f-name"), date: val("f-date"), rsvpDeadline: val("f-deadline"),
        location: val("f-loc"), description: val("f-desc"),
        nudgeAfterHours: Number(val("f-nudgeh")), nudgeMax: Number(val("f-nudgem")),
      };
      if (!data.name) return toast("Give your event a name", "err");
      if (id) { await window.Api.updateEvent(id, data); toast("Saved", "ok"); go("#/event/" + id); }
      else { const created = await window.Api.createEvent(data); toast("Event created", "ok"); go("#/event/" + created.id); }
    });
  }

  /* ===================================================================== */
  /*  EVENT DETAIL                                                          */
  /* ===================================================================== */
  async function viewEvent(id) {
    const ev = await window.Api.getEvent(id);
    if (!ev) { go("#/events"); return; }
    const guests = await window.Api.listGuests(id);
    const c = ev.counts;
    const uninvited = guests.filter((g) => !g.invitedAt).length;

    const sendPanel = (() => {
      if (!ev.paidAt) {
        const price = window.Api.priceFor(guests.length);
        const extraTxt = price.extra > 0
          ? ` + ${money(price.per)} × ${price.extra} extra`
          : "";
        return `
          <div class="card ticket reveal" style="background:var(--rose-soft);border:none">
            <div class="row between wrap gap-16">
              <div>
                <div class="eyebrow">Ready to send</div>
                <h3 style="margin-top:4px">Pay &amp; send ${guests.length} invitation${guests.length === 1 ? "" : "s"}</h3>
                <p class="muted" style="font-size:.9rem">${money(price.base)} base (up to ${price.included})${extraTxt}
                  = <b style="color:var(--rose-deep)">${money(price.totalCents)}</b></p>
              </div>
              <button class="btn primary lg" id="ev-pay" ${guests.length ? "" : "disabled"}>${icon("send")} Pay &amp; send</button>
            </div>
          </div>`;
      }
      return `
        <div class="card reveal" style="border-color:var(--ok)">
          <div class="row between wrap gap-16">
            <div>
              <span class="pill ok"><span class="dot"></span>Paid · invites live</span>
              <p class="muted mt-8" style="font-size:.9rem">${guests.length - uninvited} of ${guests.length} guests invited.</p>
            </div>
            ${uninvited ? `<button class="btn soft" id="ev-sendnew">${icon("send")} Send ${uninvited} new invite${uninvited === 1 ? "" : "s"}</button>` : ""}
          </div>
        </div>`;
    })();

    mount("events", `
      <button class="crumb" data-back>${icon("chevronLeft")} All events</button>
      <div class="page-head">
        <div>
          <div class="row gap-8">${dateChip(ev.date)}
            <div><div class="eyebrow">${ev.paidAt ? "Active" : "Draft"}</div><h1 style="margin-top:2px">${esc(ev.name)}</h1></div>
          </div>
          <p class="muted mt-8">${fmt(ev.date)}${ev.location ? " · " + esc(ev.location) : ""}</p>
        </div>
        <div class="row gap-8">
          <button class="btn" data-templates>${icon("sliders")} Messages</button>
          <button class="btn ghost" data-edit>${icon("pencil")} Edit</button>
        </div>
      </div>

      <div class="stats mb-24 reveal">
        <div class="stat"><div class="n tabular">${c.total}</div><div class="k">Invited</div></div>
        <div class="stat ok"><div class="n tabular">${c.confirmed}</div><div class="k">Confirmed</div></div>
        <div class="stat no"><div class="n tabular">${c.declined}</div><div class="k">Declined</div></div>
        <div class="stat wait"><div class="n tabular">${c.pending}</div><div class="k">Awaiting</div></div>
      </div>

      ${sendPanel}

      <div class="card pad-0 mt-24 reveal">
        <div class="card-head" style="padding:20px 24px 0;margin-bottom:0">
          <div><h3>Guest list</h3><p class="muted" style="font-size:.86rem">${c.party} attending (incl. plus-ones)</p></div>
          <button class="btn soft sm" id="ev-add">${icon("plus")} Add guests</button>
        </div>
        <div style="overflow-x:auto">
          ${guests.length ? guestTable(guests) : `
            <div class="empty">
              <p class="muted">No guests yet. Add them by name and mobile number — RSVPplease texts each a unique RSVP link.</p>
              <button class="btn primary" id="ev-add2">${icon("plus")} Add your first guest</button>
            </div>`}
        </div>
      </div>`);

    app.querySelector("[data-back]").addEventListener("click", () => go("#/events"));
    app.querySelector("[data-edit]").addEventListener("click", () => go("#/event/" + id + "/edit"));
    app.querySelector("[data-templates]").addEventListener("click", () => go("#/event/" + id + "/templates"));
    document.getElementById("ev-add")?.addEventListener("click", () => addGuestsModal(id));
    document.getElementById("ev-add2")?.addEventListener("click", () => addGuestsModal(id));
    document.getElementById("ev-pay")?.addEventListener("click", () => billingModal(id));
    document.getElementById("ev-sendnew")?.addEventListener("click", async () => {
      const r = await window.Api.sendInvites(id); toast(`Sent ${r.sent} invite${r.sent === 1 ? "" : "s"}`, "ok"); render();
    });
    app.querySelectorAll("[data-guest]").forEach((row) => {
      row.querySelector("[data-open]")?.addEventListener("click", () => openConversation(id, row.dataset.guest));
      row.querySelector("[data-nudge]")?.addEventListener("click", async () => {
        await window.Api.sendNudge(row.dataset.guest); toast("Nudge sent", "ok"); render();
      });
      row.querySelector("[data-rm]")?.addEventListener("click", () => {
        confirmDialog({ title: "Remove guest?", message: "This deletes them and their message history.", confirmLabel: "Remove", danger: true,
          onConfirm: async () => { await window.Api.removeGuest(row.dataset.guest); toast("Removed"); render(); } });
      });
      row.querySelector("[data-copy]")?.addEventListener("click", () => copy(window.Api.rsvpLink(row.dataset.token)));
    });
  }

  function channelChip(ch) {
    const label = ch === "email" ? "Email" : ch === "both" ? "Text + Email" : "Text";
    return `<span class="pill" style="font-size:.64rem;padding:2px 8px">${label}</span>`;
  }

  function guestTable(guests) {
    const rows = guests.map((g) => {
      const contact = [g.phone, g.email].filter(Boolean).join(" · ") || "no contact";
      return `
      <tr data-guest="${g.id}" data-token="${esc(g.token)}">
        <td><div class="name">${esc(g.name || "—")}</div>
          <div class="tel">${esc(contact)} ${channelChip(g.channel)}</div></td>
        <td class="tabular">${g.partySize > 1 ? g.partySize + " ppl" : "1"}</td>
        <td>${statusPill(g.status)}</td>
        <td class="muted" style="font-size:.82rem">${g.respondedAt ? "replied " + relTime(g.respondedAt) : g.invitedAt ? "invited " + relTime(g.invitedAt) : "not invited"}</td>
        <td>
          <div class="row gap-4" style="justify-content:flex-end">
            <button class="btn ghost sm" data-open title="Conversation">${icon("chat")}</button>
            <button class="btn ghost sm" data-copy title="Copy RSVP link">${icon("link")}</button>
            ${g.status === "pending" && g.invitedAt ? `<button class="btn ghost sm" data-nudge title="Send nudge">${icon("bell")}</button>` : ""}
            <button class="btn ghost sm" data-rm title="Remove">${icon("trash")}</button>
          </div>
        </td>
      </tr>`;
    }).join("");
    return `<table class="table"><thead><tr>
      <th>Guest</th><th>Party</th><th>Status</th><th>Activity</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  }

  /* ---- Add guests modal ------------------------------------------------ */
  function addGuestsModal(eventId) {
    const body = el(`<div>
      <div class="field mb-16">
        <span class="label">Add one guest</span>
        <input class="input" id="g-name" placeholder="Full name" style="margin-bottom:8px">
        <div class="field-row" style="grid-template-columns:1fr 1fr">
          <input class="input" id="g-phone" type="tel" placeholder="+1 555 123 4567">
          <input class="input" id="g-email" type="email" placeholder="guest@email.com">
        </div>
        <div class="field-row" style="grid-template-columns:1fr 1fr;margin-top:8px">
          <select class="input" id="g-channel" title="How to invite">
            <option value="sms">Invite by text</option>
            <option value="email">Invite by email</option>
            <option value="both">Text + email</option>
          </select>
          <input class="input" id="g-party" type="number" min="1" value="1" title="Party size" placeholder="Party size">
        </div>
      </div>
      <div class="field">
        <span class="label">…or paste a list <span class="faint">(one per line: Name, +phone and/or email)</span></span>
        <textarea class="textarea" id="g-bulk" placeholder="Sam Rivera, +15551230001&#10;Jo Lee, jo@email.com&#10;Priya Anand, +15551230003, priya@email.com"></textarea>
      </div>
      <p class="help mt-8">Phones in international format (+countrycode). Channel sets how each guest is invited — pasted rows auto-detect phone vs email.</p>
    </div>`);
    modal({
      title: "Add guests",
      body,
      actions: [
        { label: "Cancel", cls: "ghost", onClick: (c) => c() },
        { label: "Add guests", cls: "primary", onClick: async (c) => {
          const list = [];
          const name = val("g-name");
          if (name) list.push({ name, phone: val("g-phone"), email: val("g-email"), channel: val("g-channel"), partySize: Number(val("g-party")) || 1 });
          val("g-bulk").split("\n").map((l) => l.trim()).filter(Boolean).forEach((line) => {
            const parts = line.split(/[,\t;]+/).map((s) => s.trim());
            const email = parts.find((p) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p)) || "";
            const phone = parts.find((p) => /\+?\d[\d\s().-]{5,}/.test(p)) || "";
            const nm = parts.filter((p) => p !== phone && p !== email).join(" ");
            const channel = phone && email ? "both" : email ? "email" : "sms";
            list.push({ name: nm, phone, email, channel, partySize: 1 });
          });
          if (!list.length) return toast("Add at least one guest", "err");
          await window.Api.addGuests(eventId, list);
          c(); toast(`Added ${list.length} guest${list.length === 1 ? "" : "s"}`, "ok"); render();
        } },
      ],
    });
  }

  /* ---- Billing modal --------------------------------------------------- */
  function billingModal(eventId) {
    window.Api.listGuests(eventId).then((guests) => {
      const p = window.Api.priceFor(guests.length);
      const body = el(`<div>
        <div class="card flat" style="background:var(--surface-soft);border:1px solid var(--line)">
          <div class="price-line"><span>Base fee <span class="faint">(up to ${p.included} guests)</span></span><span class="tabular">${money(p.base)}</span></div>
          ${p.extra > 0 ? `<div class="price-line"><span>${p.extra} extra guest${p.extra === 1 ? "" : "s"} × ${money(p.per)}</span><span class="tabular">${money(p.perTotal)}</span></div>` : ""}
          <div class="price-line total"><span>Total today</span><span class="amt tabular">${money(p.totalCents)}</span></div>
        </div>
        <div class="notice rose mt-16">${icon("info")}
          <span>${window.Api.isBackendLive()
            ? "You'll be redirected to Stripe Checkout to pay securely."
            : "Front-end preview: this simulates Stripe Checkout locally, then renders each invite SMS so you can see exactly what guests receive. Real charges &amp; texts go live in Phase 2."}</span></div>
      </div>`);
      modal({
        title: "Pay & send invitations",
        body,
        actions: [
          { label: "Cancel", cls: "ghost", onClick: (c) => c() },
          { label: `Pay ${money(p.totalCents)} & send`, cls: "primary", onClick: async (c) => {
            await window.Api.checkout(eventId);
            const r = await window.Api.sendInvites(eventId);
            c(); toast(`Paid · ${r.sent} invite${r.sent === 1 ? "" : "s"} sent`, "ok"); render();
          } },
        ],
      });
    });
  }

  /* ---- Conversation drawer --------------------------------------------- */
  async function openConversation(eventId, guestId) {
    const guests = await window.Api.listGuests(eventId);
    const g = guests.find((x) => x.id === guestId);
    const msgs = await window.Api.listMessages(eventId, guestId);
    const thread = msgs.length ? msgs.map((m) => `
      <div class="bubble ${m.direction === "out" ? "out" : ""}">${esc(m.body)}
        <div class="meta">${m.direction === "out" ? "Sent" : "Received"} · ${relTime(m.createdAt)}</div></div>`).join("")
      : `<p class="muted text-c mt-24">No messages yet. Send the invite to start the thread.</p>`;

    const overlay = el('<div class="drawer-overlay"></div>');
    const drawer = el(`
      <aside class="drawer">
        <div class="drawer-head">
          <div class="row between">
            <div><h3>${esc(g.name || "Guest")}</h3><p class="tel">${esc(g.phone || "no number")}</p></div>
            <button class="btn ghost sm" data-close>${icon("x")}</button>
          </div>
          <div class="mt-8">${statusPill(g.status)}</div>
        </div>
        <div class="drawer-body">${thread}</div>
        <div class="drawer-foot">
          ${g.invitedAt ? `<button class="btn soft block mb-8" data-nudge>${icon("bell")} Send a nudge</button>` : ""}
          <p class="help mb-8">${window.Api.isBackendLive() ? "Replies arrive here automatically via Twilio." : "Simulate an inbound reply (Phase 2: real Twilio SMS):"}</p>
          <div class="row gap-8">
            <button class="btn sm" data-reply="confirmed" style="flex:1">Reply “YES”</button>
            <button class="btn sm" data-reply="declined" style="flex:1">Reply “NO”</button>
          </div>
        </div>
      </aside>`);
    overlay.appendChild(drawer);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.classList.add("open"); drawer.classList.add("open"); });
    const body = drawer.querySelector(".drawer-body");
    body.scrollTop = body.scrollHeight;

    const close = () => { overlay.classList.remove("open"); drawer.classList.remove("open"); setTimeout(() => overlay.remove(), 250); };
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    drawer.querySelector("[data-close]").addEventListener("click", close);
    drawer.querySelector("[data-nudge]")?.addEventListener("click", async () => { await window.Api.sendNudge(guestId); close(); toast("Nudge sent", "ok"); render(); });
    drawer.querySelectorAll("[data-reply]").forEach((b) => b.addEventListener("click", async () => {
      await window.Api.recordRsvp(g.token, { status: b.dataset.reply, viaSms: true });
      close(); toast(b.dataset.reply === "confirmed" ? "Marked confirmed · auto-reply sent" : "Marked declined · auto-reply sent", "ok"); render();
    }));
  }

  /* ===================================================================== */
  /*  TEMPLATES EDITOR                                                      */
  /* ===================================================================== */
  async function viewTemplates(id) {
    const ev = await window.Api.getEvent(id);
    if (!ev) { go("#/events"); return; }
    const templates = await window.Api.getTemplates(id);
    let active = "invite";
    const types = window.Api.TEMPLATE_TYPES;

    mount("events", `
      <button class="crumb" data-back>${icon("chevronLeft")} Back to ${esc(ev.name)}</button>
      <div class="page-head"><div>
        <div class="eyebrow">Messages</div>
        <h1>Customise the texts</h1>
        <p class="muted">Four messages RSVPplease sends on your behalf. Edit the wording — variables fill in per guest.</p>
      </div></div>
      <div class="tpl-grid">
        <div class="card reveal">
          <div class="tpl-tabs" id="tpl-tabs">
            ${types.map((t) => `<button class="tpl-tab ${t.key === active ? "active" : ""}" data-t="${t.key}">${esc(t.label)}</button>`).join("")}
          </div>
          <div class="field">
            <span class="label" id="tpl-hint"></span>
            <textarea class="textarea" id="tpl-body" style="min-height:150px"></textarea>
          </div>
          <div class="mt-8">
            <span class="help">Insert a variable:</span>
            <div class="var-chips" id="tpl-vars">
              ${window.Api.TEMPLATE_VARS.map((v) => `<button class="var-chip" data-v="${esc(v)}">${esc(v)}</button>`).join("")}
            </div>
          </div>
          <div class="row gap-12 mt-24">
            <button class="btn primary" id="tpl-save">${icon("check")} Save messages</button>
            <button class="btn ghost" id="tpl-reset">Reset to default</button>
          </div>
        </div>
        <div class="stack gap-12" style="align-items:center">
          <div class="phone reveal">
            <div class="notch"></div>
            <div class="screen">
              <div class="bar">RSVPplease</div>
              <div id="tpl-preview"></div>
            </div>
          </div>
          <p class="help text-c" style="max-width:280px">Live preview with a sample guest. ${esc(ev.location ? "" : "Add a location to the event for fuller previews.")}</p>
        </div>
      </div>`);

    const bodyEl = document.getElementById("tpl-body");
    const hintEl = document.getElementById("tpl-hint");
    const preview = document.getElementById("tpl-preview");

    async function paint() {
      const t = types.find((x) => x.key === active);
      hintEl.textContent = t.label + " — " + t.hint;
      bodyEl.value = templates[active];
      const rendered = await window.Api.renderPreview(id, active, { name: "Alex Rivera", token: "preview" });
      const isOut = active === "invite" || active === "nudge";
      preview.innerHTML = `<div class="bubble ${isOut ? "out" : ""}">${esc(rendered)}<div class="meta">${isOut ? "From you" : "Auto-reply"}</div></div>`;
    }
    async function repreview() {
      const rendered = window.Api.render(bodyEl.value, {
        guest: { name: "Alex Rivera", token: "preview" }, event: ev, host,
      });
      const isOut = active === "invite" || active === "nudge";
      preview.innerHTML = `<div class="bubble ${isOut ? "out" : ""}">${esc(rendered)}<div class="meta">${isOut ? "From you" : "Auto-reply"}</div></div>`;
    }

    document.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => {
      templates[active] = bodyEl.value;
      active = b.dataset.t;
      document.querySelectorAll(".tpl-tab").forEach((x) => x.classList.toggle("active", x.dataset.t === active));
      paint();
    }));
    bodyEl.addEventListener("input", () => { templates[active] = bodyEl.value; repreview(); });
    document.querySelectorAll("[data-v]").forEach((chip) => chip.addEventListener("click", () => {
      const v = chip.dataset.v;
      const s = bodyEl.selectionStart || bodyEl.value.length;
      bodyEl.value = bodyEl.value.slice(0, s) + v + bodyEl.value.slice(bodyEl.selectionEnd || s);
      templates[active] = bodyEl.value; bodyEl.focus(); repreview();
    }));
    document.getElementById("tpl-save").addEventListener("click", async () => {
      templates[active] = bodyEl.value;
      await window.Api.saveTemplates(id, templates);
      toast("Messages saved", "ok");
    });
    document.getElementById("tpl-reset").addEventListener("click", () => {
      templates[active] = window.Api.DEFAULT_TEMPLATES[active]; paint();
    });
    document.querySelector("[data-back]").addEventListener("click", () => go("#/event/" + id));
    paint();
  }

  /* ===================================================================== */
  /*  ACTIVITY INBOX                                                        */
  /* ===================================================================== */
  async function viewInbox() {
    const items = await window.Api.listActivity(60);
    const body = items.length ? `
      <div class="card pad-0 reveal">
        ${items.map((m) => `
          <div class="row gap-12" style="padding:14px 20px;border-bottom:1px solid var(--line);align-items:flex-start">
            <div class="avatar" style="width:34px;height:34px;font-size:.72rem;${m.direction === "in" ? "" : "background:linear-gradient(135deg,var(--pink-300),var(--pink-500))"}">${esc(initials(m.guest && m.guest.name))}</div>
            <div style="flex:1;min-width:0">
              <div class="row between">
                <span class="name" style="font-size:.9rem">${esc(m.guest ? m.guest.name : "Guest")}
                  <span class="faint" style="font-weight:400">· ${esc(m.event ? m.event.name : "")}</span></span>
                <span class="faint" style="font-size:.76rem">${relTime(m.createdAt)}</span>
              </div>
              <div class="muted" style="font-size:.88rem;margin-top:2px">
                ${m.direction === "in" ? `<span class="pill rose" style="font-size:.66rem">received</span> ` : ""}${esc(m.body)}</div>
            </div>
          </div>`).join("")}
      </div>` : `
      <div class="card flat empty reveal">
        <div class="art">${icon("inbox", "")}</div>
        <h3>No activity yet</h3>
        <p>Once you send invitations, every outgoing text and every reply shows up here as a single feed.</p>
      </div>`;
    mount("inbox", `
      <div class="page-head"><div>
        <div class="eyebrow">Two-way SMS</div>
        <h1>Activity</h1>
      </div></div>
      ${body}`);
  }

  /* ===================================================================== */
  /*  ROUTER                                                                */
  /* ===================================================================== */
  async function render() {
    host = await window.Api.getHost();
    if (!host) {
      const r0 = (location.hash.replace(/^#\/?/, "") || "").split("/")[0];
      return (r0 === "signin" || r0 === "login") ? viewAuth() : viewLanding();
    }

    const parts = (location.hash.replace(/^#\/?/, "") || "events").split("/");
    const [root, a, b] = parts;
    try {
      if (root === "events" || root === "") return viewEvents();
      if (root === "new") return viewEventForm(null);
      if (root === "inbox") return viewInbox();
      if (root === "event" && a) {
        if (b === "edit") return viewEventForm(a);
        if (b === "templates") return viewTemplates(a);
        return viewEvent(a);
      }
      return viewEvents();
    } catch (e) {
      console.error(e);
      toast("Something went wrong", "err");
    }
  }

  window.__rsvpRender = render; // api.supabase.js calls this on auth-state change
  window.addEventListener("hashchange", render);
  window.addEventListener("DOMContentLoaded", render);
  if (document.readyState !== "loading") render();
})();
