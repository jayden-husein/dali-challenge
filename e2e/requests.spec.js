const { test, expect } = require('@playwright/test');

const volunteerHeaders = { 'X-Shelter-Code': 'TEST-0000' };

async function register(request, registrant) {
  const res = await request.post('/api/registrants', { headers: volunteerHeaders, data: registrant });
  expect(res.status()).toBe(201);
  return (await res.json()).id;
}

async function sendRequest(request, registrant_id) {
  const res = await request.post('/api/requests', { data: { registrant_id, seeker_name: 'Marta' } });
  expect(res.status()).toBe(201);
  return (await res.json()).request_code;
}

test('a Contact Request with only a Seeker name gets a Request Code', async ({ request }) => {
  const registrant_id = await register(request, { known_as: 'Cornelius', visibility: 'findable' });
  const res = await request.post('/api/requests', { data: { registrant_id, seeker_name: 'Marta' } });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(Object.keys(body)).toEqual(['request_code']);
  expect(body.request_code).toMatch(/^[A-Z]+-[A-Z]+-\d{4}$/);
});

test('checking a pending request says only that it was passed on', async ({ request }) => {
  const code = await sendRequest(request, await register(request, { known_as: 'Philippa', visibility: 'findable' }));
  const res = await request.get(`/api/requests/${code.toLowerCase()}`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: 'passed_on' });
});

test('a request to a Not findable Registrant looks the same as any pending request', async ({ request }) => {
  const code = await sendRequest(request, await register(request, { known_as: 'Ignatius', visibility: 'not_findable' }));
  expect(await (await request.get(`/api/requests/${code}`)).json()).toEqual({ status: 'passed_on' });
});

test('an unknown Request Code is not found and reveals nothing', async ({ request }) => {
  const res = await request.get('/api/requests/NOPE-NOPE-0000');
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: 'No request with that code. Check it and try again.' });
});

// Each limit test uses its own IP, so the other tests' requests don't count toward it.
test('too many Contact Requests from one IP are rate-limited', async ({ request }) => {
  const registrant_id = await register(request, { known_as: 'Benedikta', visibility: 'findable' });
  const headers = { 'X-Forwarded-For': '203.0.113.8' };
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    statuses.push((await request.post('/api/requests', { headers, data: { registrant_id, seeker_name: 'Marta' } })).status());
  }
  expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
  expect(statuses[10]).toBe(429);
});

test('too many Request Code checks from one IP are rate-limited', async ({ request }) => {
  const headers = { 'X-Forwarded-For': '203.0.113.9' };
  const statuses = [];
  for (let i = 0; i < 31; i++) statuses.push((await request.get('/api/requests/NOPE-NOPE-0000', { headers })).status());
  expect(statuses.slice(0, 30).every((s) => s === 404)).toBe(true);
  expect(statuses[30]).toBe(429);
});

test('Seeker searches, sends a Contact Request, and checks its Request Code', async ({ page, request }) => {
  await register(request, { known_as: 'Florentyna', description: 'Yellow scarf', visibility: 'findable' });

  await page.goto('/');
  await page.getByLabel('Name or nickname').fill('Florentyna');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Florentyna' }).getByRole('button', { name: 'Send a request' }).click();
  await page.getByLabel('Your name').fill('Marta');
  await page.getByLabel('How you know them (optional)').fill('Sister');
  await page.getByRole('button', { name: 'Send request' }).click();

  const code = page.getByTestId('request-code');
  await expect(code).toHaveText(/^[A-Z]+-[A-Z]+-\d{4}$/);
  await expect(page.getByText('Write this code down.')).toBeVisible();
  const requestCode = await code.textContent();

  await page.getByRole('button', { name: 'Check request' }).click();
  await page.getByLabel('Request Code').fill(requestCode.toLowerCase());
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByText('Your request has been passed on.')).toBeVisible();
  await expect(page.getByText('Some requests are never answered. Keep searching')).toBeVisible();

  await page.getByLabel('Request Code').fill('NOPE-NOPE-0000');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByText('No request with that code. Check it and try again.')).toBeVisible();
});
