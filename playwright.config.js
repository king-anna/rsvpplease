// Playwright e2e config.
// `npm run test:e2e` serves the static site locally and drives the full host
// journey in a real browser (app in ?backend=local mode, so no live backend
// or magic-link email is needed). Live smoke tests are opt-in via E2E_LIVE=1.
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4317",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "python3 -m http.server 4317 --bind 127.0.0.1",
    url: "http://127.0.0.1:4317/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
