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
            ${host && host.role === "admin" ? a("admin", "Admin", "users") : ""}
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

  /* ---- Per-page SEO meta (title <60 chars, description <160) ----------- */
  const META = {
    "":        ["RSVPplease — RSVP invitations by text & email", "Send RSVP links by SMS or email, track who's coming, and auto-nudge the no-shows. $10 per event — no subscription."],
    how:       ["How RSVPplease works — SMS & email RSVPs", "Add guests, send invites by text or email, and let RSVPplease auto-nudge non-responders until your headcount is locked in."],
    templates: ["Message templates — RSVPplease", "Customise your invite, nudge and yes/no auto-replies for SMS and email, with a live phone preview as you type."],
    pricing:   ["Pricing — RSVPplease", "$10 per event covers up to 10 guests, then $1 each. No subscription — pay only when you send your invitations."],
    stories:   ["Why RSVPplease works", "Two-way SMS, automatic nudges and a real headcount for your next event — see why guests actually reply."],
    signin:    ["Sign in — RSVPplease", "Sign in to RSVPplease to create events, send invitations by SMS or email, and track RSVPs in real time."],
    login:     ["Sign in — RSVPplease", "Sign in to RSVPplease to create events, send invitations by SMS or email, and track RSVPs in real time."],
    events:    ["Your events — RSVPplease", "Manage your events, guests and RSVPs — and let RSVPplease chase the replies for you."],
    inbox:     ["Activity — RSVPplease", "Every outgoing invite and every reply, in one two-way SMS and email feed."],
    admin:     ["Admin — RSVPplease", "Manage users, comped access and revenue across RSVPplease."],
    new:       ["New event — RSVPplease", "Create an event and start collecting RSVPs by text and email."],
    event:     ["Event — RSVPplease", "Track who's confirmed and send invites and nudges by SMS and email."],
  };
  function setMeta(key) {
    const m = META[key] || META[""];
    document.title = m[0];
    const set = (sel) => { const el = document.head.querySelector(sel); if (el) el.setAttribute("content", m[/title/.test(sel) ? 0 : 1]); };
    ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]',
     'meta[name="twitter:title"]', 'meta[name="twitter:description"]'].forEach(set);
  }

  /* ===================================================================== */
  /*  MARKETING SITE (imported "Rally" design — public pages)              */
  /* ===================================================================== */
  function lpIcon(name, size = 18) {
    const D = {
      arrow: "M5 12h14M13 6l6 6-6 6",
      spark: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z",
      send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
      chat: "M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z",
      check: "M20 6 9 17l-5-5",
      x: "M18 6 6 18M6 6l12 12",
      calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
      pin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
      sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
      mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 6L2 7",
      bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
      users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
      plus: "M12 5v14M5 12h14",
    };
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${D[name] || D.check}"/></svg>`;
  }
  function lpAvatars(names, size) {
    const cols = ["#E58AA9", "#243763", "#F0C277", "#5BA77C", "#9B5DE5", "#3E8FD6"];
    return `<span class="lp-avstack">${names.map((n, i) =>
      `<span class="lp-av" style="width:${size}px;height:${size}px;background:${cols[i % cols.length]}">${esc((n[0] || "·").toUpperCase())}</span>`).join("")}</span>`;
  }
  const lpLogo = `<a href="#/" aria-label="RSVP please" style="display:inline-flex;align-items:center;text-decoration:none">
    <span style="position:relative;display:inline-flex;align-items:baseline;background:var(--brand-primary);color:#fff;
      border-radius:.7em .7em .7em .18em;padding:.16em .5em .2em;font-family:var(--lp-display);font-weight:700;font-size:23px;letter-spacing:-.02em;line-height:1">
      <span style="font-weight:800;letter-spacing:.01em">RSVP</span>
      <span style="font-weight:600;opacity:.9;margin-left:.36em">please</span>
      <span style="position:absolute;left:.55em;bottom:-.26em"><svg width=".36em" height=".36em" viewBox="0 0 20 20" style="display:block;overflow:visible" aria-hidden="true"><path d="M2 2 L18 2 L2 18 Z" fill="var(--brand-primary)"/></svg></span>
    </span></a>`;

  function lpReveal() {
    const root = app.querySelector(".lp-root");
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!root || reduce) return;
    const els = [].slice.call(app.querySelectorAll(".lp-reveal"));
    root.classList.add("lp-animate");
    const show = (el) => el.classList.add("is-in");
    const inView = (el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight * 0.92 && r.bottom > 0; };
    requestAnimationFrame(() => els.forEach((el) => { if (inView(el)) show(el); }));
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } }),
        { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
      els.forEach((el) => io.observe(el));
    }
    setTimeout(() => els.forEach(show), 1500);
  }

  function lpNav(active) {
    const links = [["How it works", "#/how", "how"], ["Templates", "#/templates", "templates"], ["Pricing", "#/pricing", "pricing"], ["Stories", "#/stories", "stories"]];
    return `<nav class="lp-nav"><div class="lp-container lp-nav__inner">
      ${lpLogo}
      <div class="lp-nav__links">
        ${links.map(([l, h, k]) => `<a class="lp-link ${active === k ? "mk-link--active" : ""}" href="${h}">${l}</a>`).join("")}
      </div>
      <div class="lp-nav__cta">
        <button class="lp-btn lp-btn--ghost lp-btn--sm lp-hide-sm" data-signin>Log in</button>
        <button class="lp-btn lp-btn--primary lp-btn--sm" data-start>Start an invite ${lpIcon("arrow", 16)}</button>
      </div>
    </div></nav>`;
  }
  function lpFooter() {
    const col = (h, items) => `<div class="lp-footer__col"><h5>${h}</h5>${items.map(([l, href]) => `<a href="${href}" class="lp-link">${l}</a>`).join("")}</div>`;
    return `<footer class="lp-footer"><div class="lp-container">
      <div class="lp-footer__grid">
        <div>${lpLogo}<p class="lp-footer__tag">Invitations your guests actually reply to.</p></div>
        ${col("Product", [["How it works", "#/how"], ["Pricing", "#/pricing"], ["Templates", "#/templates"]])}
        ${col("Company", [["Stories", "#/stories"]])}
        ${col("Get started", [["Sign in", "#/signin"]])}
      </div>
      <div class="lp-footer__bar"><span>© 2026 RSVPplease</span><span>Made for people who love a full table.</span></div>
    </div></footer>`;
  }
  function lpShell(active, inner) {
    app.innerHTML = `<div class="lp-root">${lpNav(active)}${inner}${lpFooter()}</div>`;
    app.querySelectorAll("[data-start],[data-signin]").forEach((b) => b.addEventListener("click", () => go("#/signin")));
    lpReveal();
    window.scrollTo(0, 0);
  }

  function lpFeature(tone, ic, title, body) {
    return `<div class="lp-feat lp-reveal"><span class="lp-feat__icon lp-feat__icon--${tone}">${lpIcon(ic, 24)}</span>
      <h3 class="lp-feat__title">${esc(title)}</h3><p class="lp-feat__body">${esc(body)}</p></div>`;
  }
  function lpStep(n, t, d) {
    return `<div class="lp-step lp-reveal"><span class="lp-step__n">${n}</span>
      <div><h4 class="lp-step__t">${esc(t)}</h4><p class="lp-step__d">${esc(d)}</p></div></div>`;
  }

  /* ---- Landing --------------------------------------------------------- */
  function lpHeroArt() {
    return `
      <div class="lp-art lp-reveal">
        <div class="lp-invite">
          <div class="lp-invite__ribbon">You're invited!</div>
          <p class="lp-invite__kicker">PLEASE JOIN US FOR</p>
          <h3 class="lp-invite__title">Maya's<br>Rooftop 30th</h3>
          <div class="lp-invite__meta">
            <span>${lpIcon("calendar", 15)} Sat, Aug 23 · 7:00 PM</span>
            <span>${lpIcon("pin", 15)} The Greenhouse, SF</span>
          </div>
          <div class="lp-invite__foot">${lpAvatars(["Maya", "Sam", "Lena", "Ben"], 28)}<span class="lp-invite__count">+24 going</span></div>
        </div>
        <div class="lp-sms">
          <div class="lp-sms__head"><span class="lp-sms__dot"></span> RSVPPLEASE · SMS</div>
          <div class="lp-sms__bubble lp-sms__bubble--in">Hi Sam! Maya's 30th is this Sat at 7. Can you make it? Reply <b>YES</b> or <b>NO</b> 💌</div>
          <div class="lp-sms__bubble lp-sms__bubble--out">YES!! wouldn't miss it 🎉</div>
        </div>
        <div class="lp-chip"><span class="lp-chip__check">${lpIcon("check", 14)}</span><span>Sam just RSVP'd <b>yes</b></span></div>
      </div>`;
  }
  function viewLanding() {
    lpShell("", `
      <header class="lp-hero"><div class="lp-container lp-hero__grid">
        <div class="lp-hero__copy lp-reveal">
          <span class="lp-eyebrow">${lpIcon("spark", 15)} No more “did you get my text?”</span>
          <h1 class="lp-h1">Invitations your guests <span class="lp-underline">actually reply to</span>.</h1>
          <p class="lp-lede">Send each guest a personal RSVP link by text or email, then let RSVPplease nudge the no-shows by SMS — so you always have a real headcount.</p>
          <div class="lp-hero__cta">
            <button class="lp-btn lp-btn--primary lp-btn--lg" data-start>Start your invite ${lpIcon("arrow", 18)}</button>
            <a class="lp-btn lp-btn--outline lp-btn--lg" href="#/how">See how it works</a>
          </div>
          <div class="lp-trust">
            ${lpAvatars(["Maya", "Sam", "Lena", "Ben", "Ada"], 34)}
            <span>Send by <b>text or email</b> · pay only when you send</span>
          </div>
        </div>
        ${lpHeroArt()}
      </div></header>

      <section class="lp-section"><div class="lp-container">
        <div class="lp-section__head lp-reveal">
          <span class="lp-eyebrow lp-eyebrow--center">${lpIcon("spark", 15)} Why hosts pick us</span>
          <h2 class="lp-h2">Everything an invite should do — nothing it shouldn't.</h2>
        </div>
        <div class="lp-feat-grid">
          ${lpFeature("pink", "sliders", "Make it yours", "Write the invite, the nudge, and the yes/no replies in your own words — with a live preview as you type.")}
          ${lpFeature("navy", "send", "Send anywhere", "Text it straight to phones or email it — chosen per guest. No app to download, no account for guests to make.")}
          ${lpFeature("gold", "chat", "We chase the RSVPs", "Haven't heard back? RSVPplease sends a friendly SMS nudge and logs the reply. Your headcount keeps itself up to date.")}
        </div>
      </div></section>

      <section class="lp-section lp-section--tight"><div class="lp-container">
        <div class="lp-steps">
          ${lpStep("1", "Add your guests", "Name + mobile or email. Paste a whole list at once — phones and emails sort themselves.")}
          ${lpStep("2", "Pay & send", "$10 covers up to 10 guests ($1 each beyond). Every guest gets a unique RSVP link.")}
          ${lpStep("3", "We auto-nudge", "Anyone who goes quiet gets a gentle SMS follow-up until your headcount is locked.")}
        </div>
      </div></section>

      <section class="lp-band"><div class="lp-container lp-band__grid">
        <div class="lp-reveal">
          <span class="lp-eyebrow lp-eyebrow--ink">${lpIcon("chat", 15)} The RSVPplease difference</span>
          <h2 class="lp-h2 lp-h2--light">People don't RSVP. So we text them.</h2>
          <p class="lp-band__lede">Set it once and RSVPplease follows up with anyone who hasn't replied — by SMS, in your event's voice. Replies sync to your guest list automatically. You just watch the “going” number climb.</p>
          <div class="lp-band__stats">
            <div><strong>2-way</strong><span>SMS conversations, logged</span></div>
            <div><strong>$10</strong><span>flat — up to 10 guests</span></div>
            <div><strong>0</strong><span>apps for guests to install</span></div>
          </div>
        </div>
        <div class="lp-thread lp-reveal">
          <div class="lp-thread__row lp-thread__row--in">${lpAvatars(["R"], 30)}<div class="lp-thread__msg">Quick one! Are you coming to Maya's 30th on Sat? Reply YES / NO</div></div>
          <div class="lp-thread__row lp-thread__row--out"><div class="lp-thread__msg lp-thread__msg--out">YES — putting it in the calendar now</div></div>
          <div class="lp-thread__row lp-thread__row--in">${lpAvatars(["R"], 30)}<div class="lp-thread__msg">Amazing 🎉 You're on the list. We'll text the address Friday.</div></div>
          <div class="lp-thread__synced"><span class="lp-badge-going">${lpIcon("check", 13)} Guest list updated · 25 going</span></div>
        </div>
      </div></section>

      <section class="lp-section"><div class="lp-container">
        <div class="lp-final lp-reveal">
          <h2 class="lp-h2">Your next party is one invite away.</h2>
          <p class="lp-final__sub">$10 per event, up to 10 guests — then $1 each. No subscription; pay only when you send.</p>
          <div class="lp-hero__cta lp-hero__cta--center">
            <button class="lp-btn lp-btn--primary lp-btn--lg" data-start>Start an invite ${lpIcon("arrow", 18)}</button>
          </div>
        </div>
      </div></section>`);
  }

  /* ---- How it works ---------------------------------------------------- */
  function mkWStep(badge, ic, title, desc, bullets, media) {
    return `<div class="mk-wstep lp-reveal">
      <div>
        <span class="mk-wstep__badge"><i>${badge}</i> ${lpIcon(ic, 15)} Step ${badge}</span>
        <h2 class="mk-wstep__t">${esc(title)}</h2>
        <p class="mk-wstep__d">${esc(desc)}</p>
        <ul class="mk-wlist">${bullets.map((b) => `<li><span class="mk-wlist__ic">${lpIcon("check", 13)}</span>${esc(b)}</li>`).join("")}</ul>
      </div>
      <div class="mk-wstep__media"><div class="mk-frame"><div class="mk-frame__body">${media}</div></div></div>
    </div>`;
  }
  function viewHowItWorks() {
    const canvas = `<div class="mk-canvas">
      <div class="mk-canvas__bar">${["#E58AA9", "#243763", "#F0C277"].map((c) => `<span class="mk-swatch" style="background:${c}"></span>`).join("")}
        <span class="mk-fontchip">Bricolage</span><span class="mk-fontchip">DM Sans</span></div>
      <div class="mk-canvas__title">Maya's Rooftop 30th</div>
      <div class="mk-canvas__line" style="width:80%"></div><div class="mk-canvas__line" style="width:60%"></div>
      <div style="display:flex;gap:8px;margin-top:6px">${lpAvatars(["Maya", "Sam", "Lena", "Ben"], 26)}</div>
    </div>`;
    const phone1 = `<div class="mk-phone"><div class="mk-phone__screen">
      <div class="mk-phone__hd"><span class="mk-phone__dot"></span> RSVPPLEASE · SMS</div>
      <div class="mk-bub mk-bub--out">Hi Sam! You're invited to Maya's 30th on Sat. RSVP: rsvpplease.app/r/… or reply YES/NO 💌</div>
      <div class="mk-bub mk-bub--in">YES!! 🎉</div></div></div>`;
    const phone2 = `<div class="mk-phone"><div class="mk-phone__screen">
      <div class="mk-phone__hd"><span class="mk-phone__dot"></span> AUTO-NUDGE</div>
      <div class="mk-bub mk-bub--out">Gentle nudge, Jo! Still hoping you can make Maya's 30th — can you let us know? 💕</div>
      <div class="mk-bub mk-bub--in">Yes sorry! count me in</div>
      <div class="mk-bub mk-bub--out">Amazing — you're on the list ✅</div></div></div>`;
    lpShell("how", `
      <header class="mk-phero"><div class="lp-container mk-phero__inner lp-reveal">
        <span class="lp-eyebrow lp-eyebrow--center">${lpIcon("spark", 15)} How it works</span>
        <h1 class="lp-h1">From guest list to a <span class="lp-underline">real headcount</span>.</h1>
        <p class="mk-phero__lede">Three steps — add your guests, send the invites, and let RSVPplease chase the no-shows by text. No app for anyone to install.</p>
      </div></header>
      <section class="lp-section" style="padding-top:12px"><div class="lp-container"><div class="mk-walk">
        ${mkWStep("1", "sliders", "Add your guests & make it yours", "Add guests by name and mobile or email — or paste your whole list and we sort phones from emails. Then write the invite, nudge and replies in your own words, with a live preview.", ["Bulk paste a guest list in seconds", "Customise all four messages (SMS + email)", "Choose each guest's channel: text, email, or both"], canvas)}
        ${mkWStep("2", "send", "Pay once, send everywhere", "Pay $10 for up to 10 guests (then $1 each) and every guest gets a unique RSVP link by text and/or email. They tap to reply — or just text YES/NO back.", ["Stripe checkout — no subscription", "Unique, trackable link per guest", "Guests need no app and no account"], phone1)}
        ${mkWStep("3", "bell", "We auto-nudge the no-shows", "Set it once and RSVPplease follows up with anyone who hasn't replied — by SMS, in your event's voice — then logs the answer to your guest list automatically.", ["Nudge after N hours, up to your limit", "Two-way replies sync instantly", "Watch the “going” count climb"], phone2)}
      </div></div></section>
      <section class="lp-section"><div class="lp-container"><div class="lp-final lp-reveal">
        <h2 class="lp-h2">Ready when you are.</h2>
        <p class="lp-final__sub">Free to start — pay only when you send.</p>
        <div class="lp-hero__cta lp-hero__cta--center"><button class="lp-btn lp-btn--primary lp-btn--lg" data-start>Start an invite ${lpIcon("arrow", 18)}</button></div>
      </div></div></section>`);
  }

  /* ---- Pricing (real RSVPplease model — not the design's fake tiers) --- */
  function viewPricing() {
    const feat = (on, label) => `<li class="${on ? "" : "is-off"}">${lpIcon(on ? "check" : "x", 17)}${esc(label)}</li>`;
    lpShell("pricing", `
      <header class="mk-phero"><div class="lp-container mk-phero__inner lp-reveal">
        <span class="lp-eyebrow lp-eyebrow--center">${lpIcon("spark", 15)} Simple, honest pricing</span>
        <h1 class="lp-h1">Pay per event. <span class="lp-underline">No subscription</span>.</h1>
        <p class="mk-phero__lede">Build your event and add guests for free. You only pay when you're ready to send the invitations.</p>
      </div></header>
      <section class="lp-section" style="padding-top:8px"><div class="lp-container">
        <div class="mk-tiers" style="grid-template-columns:minmax(0,420px);justify-content:center">
          <div class="mk-tier mk-tier--feat lp-reveal">
            <span class="mk-tier__flag">Pay only when you send</span>
            <div class="mk-tier__name">Per event</div>
            <p class="mk-tier__desc">Everything RSVPplease does, priced per party.</p>
            <div class="mk-tier__price"><span class="mk-tier__amt">$10</span><span class="mk-tier__per">/ event</span></div>
            <div class="mk-tier__note">covers up to 10 guests · then $1 per extra guest</div>
            <div class="mk-tier__cta"><button class="lp-btn lp-btn--primary lp-btn--lg" data-start style="width:100%">Start an invite ${lpIcon("arrow", 18)}</button></div>
            <ul class="mk-tier__feats">
              ${feat(true, "Up to 10 guests included")}
              ${feat(true, "+$1 per extra guest")}
              ${feat(true, "SMS & email invitations")}
              ${feat(true, "Automatic SMS nudges")}
              ${feat(true, "Two-way replies, logged")}
              ${feat(true, "Customisable messages")}
              ${feat(false, "No monthly fee — ever")}
            </ul>
          </div>
        </div>
      </div></section>
      <section class="lp-section lp-section--alt"><div class="lp-container">
        <div class="lp-section__head lp-reveal">
          <span class="lp-eyebrow lp-eyebrow--center">${lpIcon("spark", 15)} Pricing FAQ</span>
          <h2 class="lp-h2">No surprises on the bill.</h2>
        </div>
        <div class="mk-faq lp-reveal">
          ${[["What does the $10 cover?", "One event with up to 10 guests — invitations by SMS and/or email, automatic nudges to non-responders, two-way replies, and a live guest list. Beyond 10 guests it's just $1 per extra guest."],
             ["Is it really pay-per-event?", "Yes — no subscription and no monthly fee. You build the event and add guests for free, and only pay when you send the invites."],
             ["Do my guests ever pay?", "Never. Guests receive their invite and reply completely free — no app and no account to create."],
             ["Can I send by email instead of SMS?", "Both. You choose per guest whether they're invited by text, email, or both."]]
            .map(([q, a], i) => `<details class="mk-faq__item" ${i === 0 ? "open" : ""}>
              <summary class="mk-faq__q">${esc(q)}<span class="mk-faq__plus">${lpIcon("plus", 15)}</span></summary>
              <p class="mk-faq__a">${esc(a)}</p></details>`).join("")}
        </div>
      </div></section>
      <section class="lp-section"><div class="lp-container"><div class="lp-final lp-reveal">
        <h2 class="lp-h2">Start free. Pay when you send.</h2>
        <p class="lp-final__sub">No card to begin — just better RSVPs.</p>
        <div class="lp-hero__cta lp-hero__cta--center"><button class="lp-btn lp-btn--primary lp-btn--lg" data-start>Start an invite ${lpIcon("arrow", 18)}</button></div>
      </div></div></section>`);
  }

  /* ---- Templates = the real customisable MESSAGE templates ------------- */
  function viewTemplatesPage() {
    const tpl = (c1, c2, kicker, title, meta) => `<div class="mk-tpl lp-reveal">
      <div class="mk-tpl__art" style="--c1:${c1};--c2:${c2}">
        <span class="mk-tpl__use">Customise ${lpIcon("arrow", 13)}</span>
        <span class="mk-tpl__kicker">${esc(kicker)}</span>
        <span class="mk-tpl__title">${esc(title)}</span>
        <span class="mk-tpl__meta">${lpIcon("sliders", 13)} ${esc(meta)}</span>
      </div></div>`;
    lpShell("templates", `
      <header class="mk-phero"><div class="lp-container mk-phero__inner lp-reveal">
        <span class="lp-eyebrow lp-eyebrow--center">${lpIcon("sliders", 15)} Message templates</span>
        <h1 class="lp-h1">Every text, <span class="lp-underline">in your words</span>.</h1>
        <p class="mk-phero__lede">RSVPplease sends four messages on your behalf — and you control every one. Edit the wording, add variables like {{guest_name}}, and watch a live phone preview as you type.</p>
      </div></header>
      <section class="lp-section" style="padding-top:8px"><div class="lp-container">
        <div class="mk-tpl-grid">
          ${tpl("#E58AA9", "#B86081", "You're invited!", "The invitation", "First message + RSVP link")}
          ${tpl("#F0C277", "#B86C10", "Still hoping…", "The nudge", "Auto-sent to non-responders")}
          ${tpl("#5BA77C", "#356E4D", "Yay! 🎉", "The “yes” reply", "Auto-confirms attendees")}
          ${tpl("#243763", "#131C33", "Thanks for letting us know", "The “no” reply", "A warm regrets auto-reply")}
        </div>
      </div></section>
      <section class="lp-section lp-section--alt"><div class="lp-container lp-split">
        <div class="lp-split__copy lp-reveal">
          <span class="lp-eyebrow">${lpIcon("mail", 15)} SMS & email</span>
          <h2 class="lp-h2">Send the way each guest <span class="lp-underline">prefers</span>.</h2>
          <p class="lp-lede">Every template works for both text and email. Pick a guest's channel and RSVPplease formats the message for it — same words, right place.</p>
          <div style="margin-top:26px"><button class="lp-btn lp-btn--primary lp-btn--lg" data-start>Customise yours ${lpIcon("arrow", 18)}</button></div>
        </div>
        <div class="lp-split__media lp-reveal">
          <div class="mk-phone" style="width:250px"><div class="mk-phone__screen">
            <div class="mk-phone__hd"><span class="mk-phone__dot"></span> LIVE PREVIEW</div>
            <div class="mk-bub mk-bub--out">Hi Alex! 💌 You're invited to Mara & Theo's Garden Party on Sat 18 Jul. Tap to RSVP — or reply YES/NO.</div>
          </div></div>
        </div>
      </div></section>
      <section class="lp-section"><div class="lp-container"><div class="lp-final lp-reveal">
        <h2 class="lp-h2">Make it sound like you.</h2>
        <p class="lp-final__sub">Free to start — pay only when you send.</p>
        <div class="lp-hero__cta lp-hero__cta--center"><button class="lp-btn lp-btn--primary lp-btn--lg" data-start>Start an invite ${lpIcon("arrow", 18)}</button></div>
      </div></div></section>`);
  }

  /* ---- Stories (honest — product value, not fabricated testimonials) --- */
  function viewStories() {
    const story = (metric, ml, q) => `<div class="mk-story lp-reveal">
      <span class="mk-story__metric">${esc(metric)}</span>
      <p class="mk-story__q">${esc(q)}</p>
      <div class="mk-story__by"><span class="mk-story__name">${esc(ml)}</span></div></div>`;
    lpShell("stories", `
      <header class="mk-phero"><div class="lp-container mk-phero__inner lp-reveal">
        <span class="lp-eyebrow lp-eyebrow--center">${lpIcon("chat", 15)} Stories</span>
        <h1 class="lp-h1">Built for a <span class="lp-underline">full table</span>.</h1>
        <p class="mk-phero__lede">RSVPplease is new — so instead of inventing testimonials, here's exactly why it works and what you can expect.</p>
      </div></header>
      <section class="lp-section" style="padding-top:8px"><div class="lp-container">
        <div class="mk-feature lp-reveal">
          <div>
            <span class="lp-eyebrow">${lpIcon("spark", 15)} The whole idea</span>
            <p class="mk-feature__quote">“People don't reply to invites. So we text them — and they reply.”</p>
            <div class="mk-feature__by">${lpAvatars(["R"], 42)}<div><div class="mk-feature__name">RSVPplease</div><div class="mk-feature__event">SMS + email RSVPs, with auto-nudges</div></div></div>
          </div>
          <div class="lp-thread" style="background:var(--surface-card);border-color:var(--border-subtle)">
            <div class="lp-thread__row lp-thread__row--in">${lpAvatars(["R"], 30)}<div class="lp-thread__msg" style="background:var(--surface-sunken);color:var(--text-body)">Are you coming to Maya's 30th on Sat? Reply YES / NO</div></div>
            <div class="lp-thread__row lp-thread__row--out"><div class="lp-thread__msg lp-thread__msg--out">YES!</div></div>
            <div class="lp-thread__synced"><span class="lp-badge-going" style="background:var(--brand-soft);color:var(--brand-primary-press);border-color:var(--border-brand)">${lpIcon("check", 13)} Guest list updated</span></div>
          </div>
        </div>
        <div class="mk-story-grid">
          ${story("2-way", "Real conversations", "Guests reply right in the text thread — YES, NO, or a question — and your headcount updates itself.")}
          ${story("Auto", "No more chasing", "Set a nudge schedule once. Anyone who goes quiet gets a friendly follow-up until they reply.")}
          ${story("$10", "Pay only to send", "No subscription. Build the event for free and pay per event when you're ready to send.")}
        </div>
        <p class="lp-trust lp-reveal" style="justify-content:center;margin-top:34px">Used RSVPplease for your event? <a href="#/signin" style="color:var(--brand-primary-press);font-weight:600;margin-left:6px">Share your story →</a></p>
      </div></section>
      <section class="lp-section"><div class="lp-container"><div class="lp-final lp-reveal">
        <h2 class="lp-h2">Be one of the first.</h2>
        <p class="lp-final__sub">Free to start — pay only when you send.</p>
        <div class="lp-hero__cta lp-hero__cta--center"><button class="lp-btn lp-btn--primary lp-btn--lg" data-start>Start an invite ${lpIcon("arrow", 18)}</button></div>
      </div></div></section>`);
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
      // Comped accounts (granted by an admin) send for free.
      if (host.comped && !ev.paidAt) {
        return `
          <div class="card reveal" style="border-color:var(--ok)">
            <div class="row between wrap gap-16">
              <div>
                <span class="pill ok"><span class="dot"></span>Comped · sending is free</span>
                <p class="muted mt-8" style="font-size:.9rem">${guests.length - uninvited} of ${guests.length} guests invited.</p>
              </div>
              ${uninvited && guests.length ? `<button class="btn primary lg" id="ev-sendnew">${icon("send")} Send ${uninvited} invite${uninvited === 1 ? "" : "s"}</button>` : ""}
            </div>
          </div>`;
      }
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
  /*  ADMIN DASHBOARD (role === "admin")                                   */
  /* ===================================================================== */
  async function viewAdmin() {
    if (!host || host.role !== "admin") { go("#/events"); return; }
    let users;
    try {
      users = await window.Api.adminOverview();
    } catch (e) {
      mount("admin", `<div class="page-head"><div><div class="eyebrow">Admin</div><h1>All users</h1></div></div>
        <div class="notice">${icon("info")} <span>${esc(e.message || "Couldn't load users")}</span></div>`);
      return;
    }

    const totalRevenue = users.reduce((s, u) => s + u.totalPaidCents, 0);
    const compedCount = users.filter((u) => u.comped).length;
    const eventCount = users.reduce((s, u) => s + u.events, 0);

    const rows = users.map((u) => `
      <tr data-user="${esc(u.userId)}">
        <td><div class="name">${esc(u.name || "—")}</div><div class="tel">${esc(u.email || "")}</div></td>
        <td>${u.role === "admin" ? `<span class="pill rose">admin</span>` : `<span class="pill">host</span>`}</td>
        <td class="tabular">${u.events}</td>
        <td class="tabular">${u.guests}</td>
        <td class="tabular" style="font-weight:650">${money(u.totalPaidCents)}</td>
        <td>${u.comped ? `<span class="pill ok"><span class="dot"></span>Comped</span>` : `<span class="muted" style="font-size:.82rem">—</span>`}</td>
        <td style="text-align:right">
          <button class="btn ${u.comped ? "ghost" : "soft"} sm" data-comp="${u.comped ? "0" : "1"}">
            ${u.comped ? "Revoke comp" : "Comp free"}</button>
        </td>
      </tr>`).join("");

    mount("admin", `
      <div class="page-head"><div><div class="eyebrow">Admin</div><h1>All users</h1></div></div>
      <div class="stats mb-24 reveal">
        <div class="stat"><div class="n tabular">${users.length}</div><div class="k">Users</div></div>
        <div class="stat ok"><div class="n tabular">${money(totalRevenue)}</div><div class="k">Total paid</div></div>
        <div class="stat"><div class="n tabular">${compedCount}</div><div class="k">Comped</div></div>
        <div class="stat"><div class="n tabular">${eventCount}</div><div class="k">Events</div></div>
      </div>
      <div class="card pad-0 reveal" style="overflow-x:auto">
        ${users.length ? `<table class="table"><thead><tr>
          <th>User</th><th>Role</th><th>Events</th><th>Guests</th><th>Paid</th><th>Access</th><th></th>
        </tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty"><p class="muted">No users yet.</p></div>`}
      </div>`);

    app.querySelectorAll("[data-user]").forEach((row) => {
      row.querySelector("[data-comp]")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await window.Api.adminSetComped(row.dataset.user, btn.dataset.comp === "1");
          toast(btn.dataset.comp === "1" ? "Comped — free access granted" : "Comp revoked", "ok");
          render();
        } catch (err) { toast(err.message || "Failed", "err"); btn.disabled = false; }
      });
    });
  }

  /* ===================================================================== */
  /*  ROUTER                                                                */
  /* ===================================================================== */
  async function render() {
    host = await window.Api.getHost();

    // Public marketing pages (accessible signed-in or out).
    const mroot = (location.hash.replace(/^#\/?/, "") || "").split("/")[0];
    setMeta(mroot);
    if (mroot === "how") return viewHowItWorks();
    if (mroot === "templates" && !location.hash.includes("/event/")) return viewTemplatesPage();
    if (mroot === "pricing") return viewPricing();
    if (mroot === "stories") return viewStories();

    if (!host) {
      return (mroot === "signin" || mroot === "login") ? viewAuth() : viewLanding();
    }

    const parts = (location.hash.replace(/^#\/?/, "") || "events").split("/");
    const [root, a, b] = parts;
    try {
      if (root === "events" || root === "") return viewEvents();
      if (root === "new") return viewEventForm(null);
      if (root === "inbox") return viewInbox();
      if (root === "admin") return viewAdmin();
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
