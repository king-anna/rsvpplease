/* =========================================================================
   RSVPplease — public RSVP page
   Opens via rsvp.html?t=<token>. Shows the invite and records the response
   through the same Api seam (Phase 2: cross-device via Supabase).
   ========================================================================= */
(function () {
  const { esc, el, icon, toast } = window.UI;
  const root = document.getElementById("rsvp");
  const fmt = window.Api.fmtDate;

  const token = new URLSearchParams(location.search).get("t");

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
              <div class="field"><span class="label">Note to host <span class="faint">(optional)</span></span>
                <input class="input" id="r-note" placeholder="Can't wait!"></div>
            </div>
            ${event.guestQuestion ? `
            <div class="field mb-16"><span class="label">${esc(event.guestQuestion)}</span>
              <input class="input" id="r-answer" placeholder="Your answer" value="${esc(guest.answer || "")}"></div>` : ""}
          </div>
          ${goingStrip(event)}
          ${guest.status === "confirmed" ? calendarButtons(event) : ""}

          <button class="btn primary block lg" id="r-submit" disabled>Send my RSVP</button>
          <p class="help text-c mt-16">Powered by RSVP<b>please</b> · or just reply to the text</p>
        </div>
      </div>`;

    const extra = document.getElementById("extra");
    const submit = document.getElementById("r-submit");
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
      });
      // Re-fetch: confirming may unlock the hidden address and the going list.
      let fresh = null;
      try { fresh = await window.Api.getGuestByToken(token); } catch (e) { /* keep what we have */ }
      renderDone(choice, (fresh && fresh.event) || event, guest, res.autoReply);
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
          ${yes ? calendarButtons(event) : ""}
          ${goingStrip(event)}
          ${autoReply ? `
            <div class="phone" style="width:100%;background:transparent;box-shadow:none;border:none;padding:0">
              <div class="bubble" style="margin:0 auto">${esc(autoReply)}<div class="meta">From ${esc(event.name)}</div></div>
            </div>` : ""}
          <p class="help text-c mt-16">Changed your mind? Just reply to the text and your host will see it.</p>
        </div>
      </div>`;
    toast(yes ? "RSVP confirmed" : "Reply sent", "ok");
  }

  async function init() {
    if (!token) return notFound("No invitation code in this link.");
    const found = await window.Api.getGuestByToken(token);
    if (!found || !found.event) return notFound();
    paintPage(found.event);
    // Already-replied guests land here too — they can update their answer, and
    // (having responded) they see the going list / revealed address if enabled.
    renderInvite(found.guest, found.event);
  }

  init();
})();
