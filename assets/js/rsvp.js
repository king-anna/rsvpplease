/* =========================================================================
   RSVPplease — public RSVP page
   Opens via rsvp.html?t=<token>. Shows the invite and records the response
   through the same Api seam (Phase 2: cross-device via Supabase).
   ========================================================================= */
(function () {
  const { esc, el, icon, toast, relTime } = window.UI;
  const root = document.getElementById("rsvp");
  const fmt = window.Api.fmtDate;

  // Personal invite (?t=), or the party's open link (?e= / /join/<open_token>).
  let token = new URLSearchParams(location.search).get("t");
  const openToken = new URLSearchParams(location.search).get("e") ||
    (location.pathname.match(/^\/join\/([^/]+)\/?$/) || [])[1] || null;

  function notFound(msg) {
    root.innerHTML = `
      <div class="card invite ticket text-c reveal">
        <div class="empty">
          <div class="art">${icon("heart", "")}</div>
          <h3>Invitation not found</h3>
          <p>${esc(msg || "This RSVP link looks broken or has expired. Ask your host to resend it.")}</p>
        </div>
      </div>`;
  }

  function detail(ic, text) {
    return text ? `<div class="detail-line">${icon(ic)}<span>${esc(text)}</span></div>` : "";
  }

  /* ---- The invitation design ------------------------------------------- */
  // Shared with the host's builder preview — see InviteDesign in ui.js.
  // Hosts pick a theme + colour (stored on the event); a cover photo, when
  // set, sits under a soft ink overlay. Older events fall back to the default
  // confetti/blush look.
  const inviteBanner = (event) => window.InviteDesign.banner(event, "h1");

  // Full-page takeover: paint the whole viewport with the theme and float the
  // motif (or the host's custom emoji) across it. The card goes glass on top.
  function paintPage(event) {
    const D = window.InviteDesign;
    document.body.classList.add("rsvp-themed");
    document.body.classList.toggle("rsvp-dark", !!D.themeOf(event).dark);
    document.body.setAttribute("style", D.pageSolid(event));
    document.querySelector(".inv-pagefx")?.remove();
    document.body.insertAdjacentHTML("afterbegin", D.pageLayer(event));
  }

  // Extras chips — only what the host filled in. URLs open in a new tab and
  // show their hostname; anything else renders as plain text.
  function extrasChips(event) {
    const x = event.extras || {};
    const asLink = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
    const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
    const chip = (emoji, label, value, href) => !value ? "" : (href
      ? `<a class="inv-extra" href="${esc(href)}" target="_blank" rel="noopener">${emoji} <b>${esc(label)}</b> ${esc(value)}</a>`
      : `<span class="inv-extra">${emoji} <b>${esc(label)}</b> ${esc(value)}</span>`);
    const pl = asLink(x.playlistUrl), rg = asLink(x.registryUrl);
    const chips = [
      chip("👗", "Dress code", x.dressCode),
      x.playlistUrl ? chip("🎵", "Playlist", pl ? hostOf(pl) : x.playlistUrl, pl) : "",
      x.registryUrl ? chip("🎁", "Registry", rg ? hostOf(rg) : x.registryUrl, rg) : "",
      chip("🅿️", "Parking", x.parking),
    ].join("");
    return chips ? `<div class="inv-extras">${chips}</div>` : "";
  }

  // "Add to calendar" — a Google Calendar link + a downloadable .ics for
  // Apple/Outlook. Shown once the guest has confirmed (so it carries the
  // revealed address). Times are floating local (host's clock); 3h default.
  function calendarButtons(event) {
    if (!event.date) return "";
    const start = new Date(event.date);
    if (isNaN(start)) return "";
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const local = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const icsText = (s) => (s || "").replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");

    const g = new URL("https://calendar.google.com/calendar/render");
    g.searchParams.set("action", "TEMPLATE");
    g.searchParams.set("text", event.name || "Party");
    g.searchParams.set("dates", `${local(start)}/${local(end)}`);
    if (event.location) g.searchParams.set("location", event.location);
    g.searchParams.set("details", "RSVP: " + location.href);

    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RSVPplease//EN", "BEGIN:VEVENT",
      `UID:${token}@rsvpplease.app`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `DTSTART:${local(start)}`,
      `DTEND:${local(end)}`,
      `SUMMARY:${icsText(event.name || "Party")}`,
      event.location ? `LOCATION:${icsText(event.location)}` : "",
      `DESCRIPTION:${icsText("RSVP: " + location.href)}`,
      "END:VEVENT", "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");
    const icsName = ((event.name || "party").replace(/[^\w -]/g, "").trim() || "party") + ".ics";

    return `
      <div class="cal-row">
        <span class="cal-row__label">📅 Add to calendar</span>
        <a class="inv-extra" href="${esc(g.toString())}" target="_blank" rel="noopener">Google</a>
        <a class="inv-extra" href="data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}" download="${esc(icsName)}">Apple / Outlook</a>
      </div>`;
  }

  // Opt-in social proof — the API only returns counts once THIS guest replied.
  function goingStrip(event) {
    if (event.goingCount == null || event.goingCount <= 0) return "";
    const names = (event.goingNames || []).join(", ");
    return `<div class="inv-going">🎉 ${event.goingCount} going${names ? ` · <span class="names">${esc(names)}</span>` : ""}</div>`;
  }

  // The party wall — recent replies + comments, same gate as goingStrip.
  function activityStrip(event) {
    const acts = event.activity || [];
    if (!acts.length) return "";
    return `<div class="inv-activity">
      <div class="inv-activity__t">Party wall</div>
      ${acts.map((a) => `
        <div class="inv-act">
          <span class="inv-act__ic">${a.status === "confirmed" ? "🎉" : "😢"}</span>
          <span class="inv-act__txt"><b>${esc(a.name)}</b> ${a.status === "confirmed" ? "is going" : "can't make it"}${a.note ? ` — <i>“${esc(a.note)}”</i>` : ""}
            ${a.gif ? `<img class="inv-act__gif" loading="lazy" src="${esc(a.gif)}" alt="">` : ""}</span>
          <span class="inv-act__when">${a.at ? esc(relTime(a.at)) : ""}</span>
        </div>`).join("")}
    </div>`;
  }

  // Comment label depends on visibility: with "Show who's going" ON the note
  // lands on the party wall, so guests must know it isn't private.
  const noteLabel = (event) => event.showGuests
    ? `Leave a comment 🎉 <span class="faint">(other guests can see it)</span>`
    : `Note to host <span class="faint">(optional)</span>`;

  /* ---- GIF on the comment (GIPHY, proxied server-side) ------------------ */
  // The "Powered By GIPHY" mark in the picker is required by GIPHY's API
  // terms (§5A) — official asset, themed for light/dark cards.
  function gifAttachHTML(event) {
    const mark = window.InviteDesign.themeOf(event).dark ? "/assets/img/giphy-dark.png" : "/assets/img/giphy-light.png";
    return `
      <div class="gif-attach mb-16">
        <div class="row gap-8" style="align-items:center;flex-wrap:wrap">
          <button type="button" class="btn sm soft" id="gif-btn">🎬 Add a GIF</button>
          <span id="gif-preview"></span>
        </div>
        <div id="gif-panel" class="gif-panel hide">
          <div class="row gap-8" style="align-items:center">
            <input class="input" id="gif-q" placeholder="Search GIFs…" style="flex:1;min-width:0">
            <img class="gif-mark" src="${mark}" alt="Powered by GIPHY">
          </div>
          <div class="gif-grid" id="gif-grid"></div>
          <div class="hide" id="gif-fallback">
            <p class="help" style="margin:8px 0 6px">Search is unavailable — paste a GIF link instead:</p>
            <input class="input" id="gif-url" type="url" placeholder="https://…gif">
          </div>
        </div>
      </div>`;
  }
  // Wires the picker; returns () => the chosen GIF url (or "").
  function wireGifAttach() {
    const btn = document.getElementById("gif-btn");
    if (!btn) return () => "";
    const panel = document.getElementById("gif-panel");
    const grid = document.getElementById("gif-grid");
    const q = document.getElementById("gif-q");
    const fallback = document.getElementById("gif-fallback");
    const preview = document.getElementById("gif-preview");
    let chosen = "";

    const setChosen = (url) => {
      chosen = url || "";
      preview.innerHTML = chosen
        ? `<span class="gif-chosen"><img src="${esc(chosen)}" alt=""><button type="button" id="gif-rm" aria-label="Remove GIF">✕</button></span>`
        : "";
      document.getElementById("gif-rm")?.addEventListener("click", () => setChosen(""));
      if (chosen) panel.classList.add("hide");
    };

    let timer = null, seq = 0;
    const search = async () => {
      const my = ++seq;
      grid.innerHTML = `<span class="help">Loading…</span>`;
      let gifs = [];
      try { gifs = await window.Api.gifSearch(q.value.trim()); } catch (e) { /* fall back */ }
      if (my !== seq) return; // a newer search finished first
      if (!gifs.length) { grid.innerHTML = ""; fallback.classList.remove("hide"); return; }
      fallback.classList.add("hide");
      grid.innerHTML = gifs.map((g) =>
        `<button type="button" class="gif-cell" data-gif="${esc(g.url)}" style="background-image:url('${esc(g.preview)}')" aria-label="Choose GIF"></button>`).join("");
      grid.querySelectorAll("[data-gif]").forEach((b) =>
        b.addEventListener("click", () => setChosen(b.dataset.gif)));
    };

    btn.addEventListener("click", () => {
      panel.classList.toggle("hide");
      if (!panel.classList.contains("hide") && !grid.childElementCount) search();
    });
    q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 350); });
    document.getElementById("gif-url").addEventListener("change", (e) => {
      const v = (e.target.value || "").trim();
      if (/^https:\/\/\S+\.(gif|webp)(\?\S*)?$/i.test(v) || /^https:\/\/media\d*\.giphy\.com\//.test(v)) setChosen(v);
      else if (v) toast("That doesn't look like a GIF link", "err");
    });
    return () => chosen;
  }

  /* ---- Photo album (responded guests only — event.photos present) ------- */
  function albumSection(event) {
    if (!Array.isArray(event.photos)) return "";
    const cells = event.photos.map((p) =>
      `<a class="alb-cell" href="${esc(p.url)}" target="_blank" rel="noopener" style="background-image:url('${esc(p.url)}')" aria-label="Party photo"></a>`).join("");
    return `
      <div class="inv-album">
        <div class="inv-activity__t">📸 Party album</div>
        ${event.photos.length ? `<div class="alb-grid">${cells}</div>` : `<p class="help" style="margin:2px 0 8px">No photos yet — add the first!</p>`}
        <button type="button" class="btn sm soft" id="alb-add">Add photos</button>
        <input type="file" id="alb-file" accept="image/jpeg,image/png,image/webp" multiple hidden>
      </div>`;
  }
  // Client-side shrink so uploads are quick and under the server cap.
  function shrinkImage(file, maxPx, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * sc));
        c.height = Math.max(1, Math.round(img.height * sc));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error("Couldn't read that image")); };
      img.src = URL.createObjectURL(file);
    });
  }
  function wireAlbum(rerender) {
    const add = document.getElementById("alb-add");
    if (!add) return;
    const input = document.getElementById("alb-file");
    add.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const files = [...(input.files || [])].slice(0, 6);
      if (!files.length) return;
      add.disabled = true; add.textContent = "Uploading…";
      // Local preview stores data-URLs in localStorage → keep them tiny there.
      const live = window.Api.isBackendLive();
      let ok = 0;
      for (const f of files) {
        try {
          const dataUrl = await shrinkImage(f, live ? 1600 : 700, live ? 0.85 : 0.7);
          await window.Api.uploadPartyPhoto(token, dataUrl);
          ok++;
        } catch (e) { toast(e.message || "Upload failed", "err"); }
      }
      if (ok) toast(`Added ${ok} photo${ok === 1 ? "" : "s"} 📸`, "ok");
      rerender();
    });
  }

  function renderInvite(guest, event) {
    let choice = null;
    root.innerHTML = `
      <div class="card invite ticket reveal pad0">
        ${inviteBanner(event)}
        <div class="inv-body">
          <p class="muted text-c" style="margin:0 0 14px">Hi ${esc((guest.name || "there").split(" ")[0])} — ${esc(event.hostName || "your host")} would love to see you there.</p>

          <div class="mb-16">
            ${detail("calendar", fmt(event.date))}
            ${event.locationHidden
              ? `<div class="detail-line">${icon("location")}<span class="faint">Address shared once you RSVP</span></div>`
              : detail("location", event.location)}
          </div>

          ${extrasChips(event)}
          ${event.description ? `<div class="host-note mb-16">${esc(event.description)}</div>` : ""}

          <div class="field mb-16">
            <span class="label">Will you be there?</span>
            <div class="big-choice big-choice--orbs">
              <button class="choice--orb yes" data-c="confirmed">
                <span class="choice__emo">${window.InviteDesign.choiceEmoji(event).yes}</span>
                <span class="big">Yes</span>
                <span class="choice__sub">Count me in</span>
              </button>
              <button class="choice--orb no" data-c="declined">
                <span class="choice__emo">${window.InviteDesign.choiceEmoji(event).no}</span>
                <span class="big">Can't make it</span>
                <span class="choice__sub">Maybe next time</span>
              </button>
            </div>
          </div>

          <div id="extra" class="hide">
            <div class="${event.allowPlusOne === false ? "field" : "field-row"} mb-16">
              ${event.allowPlusOne === false ? "" : `
              <div class="field"><span class="label">How many in your party?</span>
                <input class="input" id="r-party" type="number" min="1" value="${guest.partySize || 1}"></div>`}
              <div class="field"><span class="label">${noteLabel(event)}</span>
                <input class="input" id="r-note" placeholder="Can't wait!"></div>
            </div>
            ${event.guestQuestion ? `
            <div class="field mb-16"><span class="label">${esc(event.guestQuestion)}</span>
              <input class="input" id="r-answer" placeholder="Your answer" value="${esc(guest.answer || "")}"></div>` : ""}
            ${gifAttachHTML(event)}
          </div>
          ${goingStrip(event)}
          ${activityStrip(event)}
          ${albumSection(event)}
          ${guest.status === "confirmed" ? calendarButtons(event) : ""}

          <button class="btn primary block lg" id="r-submit" disabled>Send my RSVP</button>
          <p class="help text-c mt-16">Powered by RSVP<b>please</b> · or just reply to the text</p>
        </div>
      </div>`;

    const extra = document.getElementById("extra");
    const submit = document.getElementById("r-submit");
    const getGif = wireGifAttach();
    wireAlbum(init);
    root.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => {
      choice = b.dataset.c;
      root.querySelectorAll("[data-c]").forEach((c) => c.classList.remove("sel"));
      b.classList.add("sel");
      extra.classList.toggle("hide", choice !== "confirmed");
      submit.disabled = false;
      submit.textContent = choice === "confirmed" ? "Yes, I'll be there 🎉" : "Send my reply";
    }));

    submit.addEventListener("click", async () => {
      if (!choice) return;
      submit.disabled = true;
      const res = await window.Api.recordRsvp(token, {
        status: choice,
        partySize: document.getElementById("r-party")?.value,
        note: document.getElementById("r-note")?.value,
        answer: document.getElementById("r-answer")?.value,
        gif: getGif(),
      });
      // Re-fetch: confirming may unlock the hidden address, going list & album.
      let fresh = null;
      try { fresh = await window.Api.getGuestByToken(token); } catch (e) { /* keep what we have */ }
      renderDone(choice, (fresh && fresh.event) || event, (fresh && fresh.guest) || guest, res.autoReply);
    });
  }

  /* ---- Open invite (/join/<open_token>) — self-serve RSVP --------------- */
  // Same themed invite, but the guest introduces themselves: name + phone.
  // They arrive already-responded, so they're never texted an invite and
  // never counted for billing (self_registered on the backend).
  function renderOpenInvite(event) {
    let choice = null;
    root.innerHTML = `
      <div class="card invite ticket reveal pad0">
        ${inviteBanner(event)}
        <div class="inv-body">
          <p class="muted text-c" style="margin:0 0 14px">${esc(event.hostName || "Your host")} is gathering RSVPs — reply in seconds.</p>

          <div class="mb-16">
            ${detail("calendar", fmt(event.date))}
            ${event.locationHidden
              ? `<div class="detail-line">${icon("location")}<span class="faint">Address shared once you RSVP</span></div>`
              : detail("location", event.location)}
          </div>

          ${extrasChips(event)}
          ${event.description ? `<div class="host-note mb-16">${esc(event.description)}</div>` : ""}

          <div class="field mb-16">
            <span class="label">Will you be there?</span>
            <div class="big-choice big-choice--orbs">
              <button class="choice--orb yes" data-c="confirmed">
                <span class="choice__emo">${window.InviteDesign.choiceEmoji(event).yes}</span>
                <span class="big">Yes</span>
                <span class="choice__sub">Count me in</span>
              </button>
              <button class="choice--orb no" data-c="declined">
                <span class="choice__emo">${window.InviteDesign.choiceEmoji(event).no}</span>
                <span class="big">Can't make it</span>
                <span class="choice__sub">Maybe next time</span>
              </button>
            </div>
          </div>

          <div id="extra" class="hide">
            <div class="field-row mb-16">
              <div class="field"><span class="label">Your name</span>
                <input class="input" id="r-name" placeholder="Sam Rivera" autocomplete="name"></div>
              <div class="field"><span class="label">Phone number</span>
                <input class="input" id="r-phone" type="tel" inputmode="tel" placeholder="+15551234567" autocomplete="tel"></div>
            </div>
            <p class="help" style="margin:-8px 0 14px">For event updates from your host — no spam.</p>
            <!-- honeypot: humans never see or fill this -->
            <input class="input hp-field" id="r-website" tabindex="-1" autocomplete="off" aria-hidden="true">
            <div id="extra-yes" class="hide">
              <div class="${event.allowPlusOne === false ? "field" : "field-row"} mb-16">
                ${event.allowPlusOne === false ? "" : `
                <div class="field"><span class="label">How many in your party?</span>
                  <input class="input" id="r-party" type="number" min="1" value="1"></div>`}
                <div class="field"><span class="label">${noteLabel(event)}</span>
                  <input class="input" id="r-note" placeholder="Can't wait!"></div>
              </div>
              ${event.guestQuestion ? `
              <div class="field mb-16"><span class="label">${esc(event.guestQuestion)}</span>
                <input class="input" id="r-answer" placeholder="Your answer"></div>` : ""}
              ${gifAttachHTML(event)}
            </div>
          </div>

          <button class="btn primary block lg" id="r-submit" disabled>Send my RSVP</button>
          <p class="help text-c mt-16">Powered by RSVP<b>please</b></p>
        </div>
      </div>`;

    const extra = document.getElementById("extra");
    const extraYes = document.getElementById("extra-yes");
    const submit = document.getElementById("r-submit");
    const getGif = wireGifAttach();

    // Clean the phone as they type — spaces/brackets stripped, leading + forced.
    const phoneEl = document.getElementById("r-phone");
    phoneEl.addEventListener("input", () => {
      let s = phoneEl.value.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
      if (s && s[0] !== "+") s = "+" + s;
      if (s !== phoneEl.value) {
        const atEnd = phoneEl.selectionStart === phoneEl.value.length;
        phoneEl.value = s;
        if (atEnd) phoneEl.setSelectionRange(s.length, s.length);
      }
    });

    root.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => {
      choice = b.dataset.c;
      root.querySelectorAll("[data-c]").forEach((c) => c.classList.remove("sel"));
      b.classList.add("sel");
      extra.classList.remove("hide");
      extraYes.classList.toggle("hide", choice !== "confirmed");
      submit.disabled = false;
      submit.textContent = choice === "confirmed" ? "Yes, I'll be there 🎉" : "Send my reply";
    }));

    submit.addEventListener("click", async () => {
      if (!choice) return;
      const name = (document.getElementById("r-name").value || "").trim();
      const phone = (phoneEl.value || "").trim();
      if (!name) return toast("Please tell us your name", "err");
      if (phone.replace(/\D/g, "").length < 7) return toast("Please add a valid phone number", "err");
      submit.disabled = true;
      try {
        const res = await window.Api.openRsvp(openToken, {
          name, phone, status: choice,
          partySize: document.getElementById("r-party")?.value,
          note: document.getElementById("r-note")?.value,
          answer: document.getElementById("r-answer")?.value,
          hp: document.getElementById("r-website")?.value,
          gif: getGif(),
        });
        if (res.token) {
          // Continue as this guest: their personal link becomes the URL, so a
          // refresh (or bookmark) keeps their RSVP state.
          token = res.token;
          const q = new URLSearchParams(location.search);
          q.delete("e"); q.set("t", res.token);
          history.replaceState(null, "", "/rsvp.html?" + q.toString());
          let fresh = null;
          try { fresh = await window.Api.getGuestByToken(res.token); } catch (e) { /* keep event */ }
          renderDone(choice, (fresh && fresh.event) || event, (fresh && fresh.guest) || { name }, res.autoReply);
        } else {
          renderDone(choice, event, { name }, res.autoReply);
        }
      } catch (e) {
        toast(e.message || "Couldn't send your RSVP", "err");
        submit.disabled = false;
      }
    });
  }

  function renderDone(choice, event, guest, autoReply) {
    const yes = choice === "confirmed";
    root.innerHTML = `
      <div class="card invite ticket text-c reveal pad0">
        ${inviteBanner(event)}
        <div class="inv-body">
          <div class="empty" style="padding:16px 24px 20px">
            <div class="art" style="color:${yes ? "var(--ok)" : "var(--rose)"}">${icon(yes ? "check" : "heart", "")}</div>
            <h2>${yes ? "You're on the list!" : "Thanks for letting us know"}</h2>
            <p>${yes
              ? `We can't wait to celebrate ${esc(event.name)} with you.`
              : `You'll be missed at ${esc(event.name)} — thanks for the quick reply.`}</p>
          </div>
          ${yes && (event.date || event.location) ? `
          <div class="mb-16" style="text-align:left">
            ${detail("calendar", fmt(event.date))}
            ${detail("location", event.location)}
          </div>` : ""}
          ${guest && guest.gifUrl ? `<img class="inv-done__gif" src="${esc(guest.gifUrl)}" alt="">` : ""}
          ${yes ? calendarButtons(event) : ""}
          ${goingStrip(event)}
          ${activityStrip(event)}
          ${albumSection(event)}
          ${autoReply ? `
            <div class="phone" style="width:100%;background:transparent;box-shadow:none;border:none;padding:0">
              <div class="bubble" style="margin:0 auto">${esc(autoReply)}<div class="meta">From ${esc(event.name)}</div></div>
            </div>` : ""}
          <p class="help text-c mt-16">Changed your mind? Just reply to the text and your host will see it.</p>
        </div>
      </div>`;
    toast(yes ? "RSVP confirmed" : "Reply sent", "ok");
    // "Add photos" on the done view → refresh the album in place.
    wireAlbum(async () => {
      let f = null;
      try { f = await window.Api.getGuestByToken(token); } catch (e) { /* keep view */ }
      if (f) renderDone(choice, f.event, f.guest, "");
    });
  }

  async function init() {
    if (token) {
      const found = await window.Api.getGuestByToken(token);
      if (!found || !found.event) return notFound();
      paintPage(found.event);
      // Already-replied guests land here too — they can update their answer, and
      // (having responded) they see the going list / revealed address if enabled.
      renderInvite(found.guest, found.event);
      return;
    }
    if (openToken) {
      const found = await window.Api.getOpenInvite(openToken);
      if (!found || !found.event) return notFound("This party link looks broken or the party has ended.");
      paintPage(found.event);
      renderOpenInvite(found.event);
      return;
    }
    notFound("No invitation code in this link.");
  }

  init();
})();
