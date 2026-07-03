// Live smoke tests against the deployed site + backend. Opt-in (they hit
// production): E2E_LIVE=1 npx playwright test e2e/live-smoke.spec.js
const { test, expect } = require("@playwright/test");

const SITE = "https://rsvpplease.app";
const SUPABASE = "https://ehhitnddiudoxgzoxpys.supabase.co";
// Public anon key — safe to commit (same one shipped in assets/js/config.js).
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoaGl0bmRkaXVkb3hnem94cHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzODAwNjMsImV4cCI6MjA5Nzk1NjA2M30.abAdZ8fJLIGyIHuLh4oaXq1SA-eIkXZL7kowTKal8ig";

test.skip(!process.env.E2E_LIVE, "live smoke is opt-in: set E2E_LIVE=1");

test("landing is up and leads with free", async ({ page }) => {
  await page.goto(SITE + "/");
  await expect(page.locator(".lp-h1")).toContainText("actually reply to");
  await expect(page.locator(".lp-freeline")).toContainText("Free to create");
});

test("about page stays anonymous (no founder name or photo)", async ({ page }) => {
  await page.goto(SITE + "/about");
  await expect(page.locator(".lp-h1")).toContainText("tired mum");
  await expect(page.locator("body")).not.toContainText(/\bEva\b/);
  await expect(page.locator(".mk-abt__photo")).toHaveCount(0);
});

test("blog renders (webhook-fed posts or the empty state)", async ({ page }) => {
  await page.goto(SITE + "/blog");
  await expect(page.locator(".lp-h1")).toContainText("Hosting tips");
  await expect(page.locator(".blog-grid, .mk-abt-note").first()).toBeVisible();
});

test("backend: posts table is publicly readable", async ({ request }) => {
  const res = await request.get(`${SUPABASE}/rest/v1/posts?select=slug&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  expect(res.status()).toBe(200);
});

test("backend: email sign-in is enabled in auth settings", async ({ request }) => {
  const res = await request.get(`${SUPABASE}/auth/v1/settings`, { headers: { apikey: ANON } });
  expect(res.status()).toBe(200);
  const s = await res.json();
  expect(s.external.email).toBe(true);
  expect(s.disable_signup).toBe(false);
});

test("backend: magic-link email sends (registration)", async ({ request }) => {
  // KNOWN BROKEN: /auth/v1/otp hangs then 504s at the send-email step — the
  // SMTP config in the Supabase dashboard needs fixing. Un-fixme once done.
  test.fixme(true, "SMTP hangs (504) — fix dashboard Auth → SMTP settings first");
  const res = await request.post(`${SUPABASE}/auth/v1/otp`, {
    headers: { apikey: ANON, "Content-Type": "application/json" },
    data: { email: "e2e-smoke@rsvpplease.app", create_user: true },
    timeout: 20_000,
  });
  expect(res.status()).toBe(200);
});
