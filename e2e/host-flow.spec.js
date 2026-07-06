// E2E: the full journey of a host account with existing data.
// Runs the real app in a real browser against the localStorage backend
// (?backend=local) — the same UI code paths as production, minus the live
// Supabase calls (magic-link sign-in can't be automated headlessly).
//
// Covers: sign-in → create party → bulk-add guests → free share links →
// guest RSVP page → counts update → activate SMS ($10 + $1/extra) →
// EXISTING ACCOUNT: session + data survive a reload → archive → delete.
const { test, expect } = require("@playwright/test");

const LOCAL = "/index.html?backend=local";
const GUESTS = 12; // crosses the 10-guest allowance → $10 + 2×$1 = $12
const TOTAL = "$12";

test("existing account: full host journey (create → share → RSVP → SMS → archive → delete)", async ({ page }) => {
  await test.step("landing renders and leads with free", async () => {
    await page.goto(`${LOCAL}#/`);
    await expect(page.locator(".lp-h1")).toContainText("actually reply to");
    await expect(page.locator(".lp-freeline")).toContainText("Free to create");
  });

  await test.step("sign in (account created once, reused for the rest)", async () => {
    // note: the real CTA navigates to /#/signin, which would drop the
    // ?backend=local override — go to the auth route directly instead.
    await expect(page.locator("[data-start]").first()).toBeVisible();
    await page.goto(`${LOCAL}#/signin`);
    await page.click("#au-switch"); // → create account (name + email + password)
    await page.fill("#au-name", "E2E Host");
    await page.fill("#au-email", "e2e-host@test.local");
    await page.fill("#au-pass", "e2epassword");
    await page.click("#au-go");
    await expect(page.locator("h1")).toHaveText("Your parties");
    await expect(page.locator(".empty")).toContainText("No parties yet");
  });

  await test.step("create a party", async () => {
    await page.locator("[data-new]").first().click();
    await page.fill("#f-name", "E2E Garden Party");
    await page.fill("#f-loc", "14 Rosewood Lane");
    await page.click("#f-save");
    await expect(page.locator("h1")).toHaveText("E2E Garden Party");
    await expect(page.locator(".status-pill")).toContainText("Link only");
  });

  await test.step(`bulk-add ${GUESTS} guests`, async () => {
    await page.click("#ev-add");
    const lines = Array.from({ length: GUESTS },
      (_, i) => `Guest ${i + 1}, +1415555${String(1000 + i)}`).join("\n");
    await page.fill("#g-bulk", lines);
    await page.locator(".modal-foot button", { hasText: "Add guests" }).click();
    await expect(page.locator("[data-guest]")).toHaveCount(GUESTS);
    // both paths offered, priced correctly
    await expect(page.locator(".send-opt--pay .pill")).toContainText(`SMS · ${TOTAL}`);
    await expect(page.locator("#ev-share")).toBeEnabled();
  });

  let rsvpToken;
  await test.step("free path: share-links modal exposes a unique link per guest", async () => {
    await page.click("#ev-share");
    await expect(page.locator(".share-row")).toHaveCount(GUESTS);
    const link = await page.locator(".share-row [data-link]").first().getAttribute("data-link");
    rsvpToken = new URL(link).searchParams.get("t");
    expect(rsvpToken).toBeTruthy();
    await page.locator(".modal-foot button", { hasText: "Close" }).click();
  });

  await test.step("guest opens their link and confirms", async () => {
    await page.goto(`/rsvp.html?backend=local&t=${encodeURIComponent(rsvpToken)}`);
    await expect(page.locator(".invite h1")).toHaveText("E2E Garden Party");
    await page.click(".choice.yes");
    await page.click("#r-submit");
    await expect(page.locator(".invite h2")).toHaveText("You're on the list!");
  });

  await test.step("host dashboard reflects the RSVP", async () => {
    await page.goto(`${LOCAL}#/events`);
    const card = page.locator(".party-card");
    await expect(card).toHaveCount(1);
    await expect(card.locator(".party-card__stats div").first()).toContainText("1"); // going
    await card.click();
    await expect(page.locator(".stats .stat.ok .n")).toHaveText("1"); // confirmed
  });

  await test.step(`activate SMS nudges — ${TOTAL} for ${GUESTS} guests`, async () => {
    await page.click("#ev-pay");
    await expect(page.locator(".modal-head h2")).toHaveText("Activate SMS nudges");
    await expect(page.locator(".price-line.total .amt")).toHaveText(TOTAL);
    await page.locator(".modal-foot button", { hasText: "Activate" }).click();
    await expect(page.locator(".activate-card.on")).toContainText("SMS nudges active");
    await expect(page.locator(".activate-card.on")).toContainText(`${GUESTS} of ${GUESTS} guests invited`);
    await expect(page.locator(".bill-line.sum")).toContainText(TOTAL);
    await expect(page.locator(".status-pill")).toContainText("SMS active");
  });

  await test.step("EXISTING ACCOUNT: session + data survive a full reload", async () => {
    await page.goto(`${LOCAL}#/events`);
    await page.reload();
    await expect(page.locator("h1")).toHaveText("Your parties");
    await expect(page.locator(".page-head .muted")).toContainText("E2E Host · 1 party · 1 on SMS");
    await expect(page.locator(".bill-summary__amt")).toContainText("12"); // $12 billed
    await expect(page.locator(".party-card .status-pill")).toContainText("SMS active");
  });

  await test.step("archive the party from its detail page", async () => {
    await page.locator(".party-card").click();
    await page.locator(".hdr-menu [data-menu-btn]").click();
    await page.locator('[data-archive][data-val="1"]').click();
    await expect(page.locator(".page-head .status-pill")).toContainText("Archived");
    await page.goto(`${LOCAL}#/events`);
    await expect(page.locator(".arch-section")).toContainText("Archived · 1");
    await expect(page.locator(".arch-section .party-card")).toHaveCount(1);
  });

  await test.step("delete the party (with confirm) — account ends empty", async () => {
    await page.locator(".arch-section .party-card [data-menu-btn]").click();
    await page.locator("[data-del]").click();
    await expect(page.locator(".modal-head h2")).toContainText("Delete");
    await page.locator(".modal-foot .btn.danger").click();
    await expect(page.locator(".empty")).toContainText("No parties yet");
    // still signed in as the existing account
    await expect(page.locator(".page-head .muted")).toContainText("E2E Host");
  });
});
