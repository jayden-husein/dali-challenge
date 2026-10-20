const { defineConfig, devices } = require('@playwright/test');

// Tests run against a separate database, wiped at the start of every run.
// Locally that's `dali_test` over the Postgres socket; CI sets TEST_DATABASE_URL.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL || 'postgresql://%2Fvar%2Frun%2Fpostgresql/dali_test';
// A port apart from 3000 so a dev server on the real database is never reused.
const port = 3001;

// One seam for all tests: API checks use the `request` fixture (no browser),
// user flows use `page` (real Chromium). Both hit the real app + a test database.
module.exports = defineConfig({
  testDir: 'e2e',
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node e2e/reset-db.js && npm run build && npm start',
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    env: { DATABASE_URL: testDatabaseUrl, PORT: String(port) },
  },
});
