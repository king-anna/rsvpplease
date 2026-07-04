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
  // Deterministic on-brand gradient per event (hash of the name), so every
  // party gets its own look without any host setup. A cover photo, when the
  // event has one, sits under a soft ink overlay instead.
  const INV_GRADS = [
    ["#E58AA9", "#b81e58"], ["#3E5C89", "#243763"], ["#F0C277", "#B4820E"],
    ["#5BA77C", "#356E4D"], ["#9B5DE5", "#6B3FA0"], ["#3E8FD6", "#245b8f"],
  ];
  function invBackground(event) {
    if (event.coverImageUrl) {
      return `background:linear-gradient(rgba(21,34,63,.32),rgba(21,34,63,.55)),url('${esc(event.coverImageUrl)}') center/cover`;
    }
    let h = 0; const s = String(event.name || "party");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const [a, b] = INV_GRADS[h % INV_GRADS.length];
    return `background:linear-gradient(135deg, ${a}, ${b})`;
  }
  function invConfetti() {
    const colors = ["#FFD98E", "#ffffff", "#FFC7D6", "#9BE3B5", "#B7C7FF"];
    return `<div class="inv-confetti" aria-hidden="true">${Array.from({ length: 14 }, (_, i) =>
      `<span style="left:${(i * 7.3 + 3) % 96}%;background:${colors[i % colors.length]};
        width:${6 + (i % 3) * 3}px;height:${6 + ((i + 1) % 3) * 3}px;
        animation-duration:${5 + (i % 5)}s;animation-delay:${(i % 7) * 0.7}s"></span>`).join("")}</div>`;
  }
  function inviteBanner(event) {
    const hostName = event.hostName || "Your host";
    return `
      <div class="inv-banner" style="${invBackground(event)}">
        ${invConfetti()}
        <span class="inv-kicker">You're invited!</span>
        <h1 class="inv-title">${esc(event.name)}</h1>
        <span class="inv-hostline"><span class="inv-host-av">${esc((hostName[0] || "♥").toUpperCase())}</span>Hosted by ${esc(hostName)}</span>
      </div>`;
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
            ${detail("location", event.location)}
          </div>

          ${event.description ? `<div class="host-note mb-16">${esc(event.description)}</div>` : ""}

          <div class="field mb-16">
            <span class="label">Will you be there?</span>
            <div class="big-choice">
              <button class="choice yes" data-c="confirmed"><span class="big">Yes ${icon("heart")}</span>Count me in</button>
              <button class="choice no" data-c="declined"><span class="big">Can't make it</span>Maybe next time</button>
            </div>
          </div>

          <div id="extra" class="hide">
            <div class="field-row mb-16">
              <div class="field"><span class="label">How many in your party?</span>
                <input class="input" id="r-party" type="number" min="1" value="${guest.partySize || 1}"></div>
              <div class="field"><span class="label">Note to host <span class="faint">(optional)</span></span>
                <input class="input" id="r-note" placeholder="Can't wait!"></div>
            </div>
          </div>

          <button class="btn primary block lg" id="r-submit" disabled>Send my RSVP</button>
          <p class="help text-c mt-16">Powered by RSVP<b>please</b> · or just reply to the text</p>
        </div>
      </div>`;

    const extra = document.getElementById("extra");
    const submit = document.getElementById("r-submit");
    root.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => {
      choice = b.dataset.c;
      root.querySelectorAll(".choice").forEach((c) => c.classList.remove("sel"));
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
      });
      renderDone(choice, event, guest, res.autoReply);
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
    if (found.guest.respondedAt) {
      // Already replied — let them update, but greet them with current state.
      renderInvite(found.guest, found.event);
      return;
    }
    renderInvite(found.guest, found.event);
  }

  init();
})();
