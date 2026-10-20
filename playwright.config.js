const { defineConfig, devices } = require('@playwright/test');

// One seam for all tests: API checks use the `request` fixture (no browser),
// user flows use `page` (real Chromium). Both hit the real app + a test database.
module.exports = defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:3000' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
