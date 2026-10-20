const { test, expect } = require('@playwright/test');

test('health check reports the database is reachable', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ database: 'reachable' });
});
