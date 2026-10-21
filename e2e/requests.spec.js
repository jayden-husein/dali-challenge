const { test, expect } = require('@playwright/test');

const volunteerHeaders = { 'X-Shelter-Code': 'TEST-0000' };

async function register(request, registrant) {
  const res = await request.post('/api/registrants', { headers: volunteerHeaders, data: registrant });
  expect(res.status()).toBe(201);
  return (await res.json()).id;
}

// Each request comes from its own IP, so the per-IP limit doesn't cut the file short.
let ip = 0;
async function sendRequest(request, registrant_id, fields = {}) {
  const headers = { 'X-Forwarded-For': `198.51.100.${++ip}` };
  const res = await request.post('/api/requests', { headers, data: { registrant_id, seeker_name: 'Marta', ...fields } });
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

const otherShelterHeaders = { 'X-Shelter-Code': 'HERON-4821' };

async function pendingFor(request, registrant_id, headers = volunteerHeaders) {
  const res = await request.get('/api/pending-requests', { headers });
  expect(res.status()).toBe(200);
  return (await res.json()).filter((r) => r.registrant_id === registrant_id);
}

test("a Volunteer sees pending requests for their own shelter's Findable Registrants only", async ({ request }) => {
  const registrant_id = await register(request, { known_as: 'Leopoldine', age_range: '65+', description: 'Blue cane', visibility: 'findable' });
  await sendRequest(request, registrant_id, { relationship: 'Daughter', message: 'We are safe', seeker_contact: '555-0101' });
  const hidden = await register(request, { known_as: 'Ottoline', visibility: 'not_findable' });
  await sendRequest(request, hidden);

  const [pending] = await pendingFor(request, registrant_id);
  expect(pending).toEqual({
    id: expect.any(String),
    registrant_id,
    known_as: 'Leopoldine',
    age_range: '65+',
    description: 'Blue cane',
    seeker_name: 'Marta',
    relationship: 'Daughter',
    message: 'We are safe',
    seeker_contact: '555-0101',
    attempts: 0,
  });
  expect(await pendingFor(request, hidden)).toEqual([]);
  expect(await pendingFor(request, registrant_id, otherShelterHeaders)).toEqual([]);
  expect((await request.get('/api/pending-requests')).status()).toBe(401);
});

const answer = (request, id, data, headers = volunteerHeaders) => request.post(`/api/pending-requests/${id}`, { headers, data });

test("\"Couldn't find them\" keeps the request pending and counts the try", async ({ request }) => {
  const registrant_id = await register(request, { known_as: 'Gwendolyn', visibility: 'findable' });
  const code = await sendRequest(request, registrant_id);
  const [{ id }] = await pendingFor(request, registrant_id);

  expect((await answer(request, id, { answer: 'not_found' })).status()).toBe(204);
  expect((await answer(request, id, { answer: 'not_found' })).status()).toBe(204);
  expect((await pendingFor(request, registrant_id))[0].attempts).toBe(2);
  expect(await (await request.get(`/api/requests/${code}`)).json()).toEqual({ status: 'passed_on' });
});

test("a Volunteer can't answer another shelter's request", async ({ request }) => {
  const registrant_id = await register(request, { known_as: 'Theodora', visibility: 'findable' });
  await sendRequest(request, registrant_id);
  const [{ id }] = await pendingFor(request, registrant_id);

  expect((await answer(request, id, { answer: 'no' }, otherShelterHeaders)).status()).toBe(404);
  expect((await answer(request, 'not-a-uuid', { answer: 'no' })).status()).toBe(404);
  expect(await pendingFor(request, registrant_id)).toHaveLength(1);
});

test('a "No" request looks the same to the Seeker as a pending one, and leaves the list', async ({ request }) => {
  const registrant_id = await register(request, { known_as: 'Wilhelmina', visibility: 'findable' });
  const pendingCode = await sendRequest(request, registrant_id);
  const noCode = await sendRequest(request, registrant_id);
  const noId = (await pendingFor(request, registrant_id))[1].id;

  expect((await answer(request, noId, { answer: 'no' })).status()).toBe(204);
  expect((await pendingFor(request, registrant_id)).map((r) => r.id)).not.toContain(noId);
  const pending = await request.get(`/api/requests/${pendingCode}`);
  const no = await request.get(`/api/requests/${noCode}`);
  expect(no.status()).toBe(pending.status());
  expect(await no.json()).toEqual(await pending.json());
  expect((await answer(request, noId, { answer: 'no' })).status()).toBe(404);
});

test('a "Yes" shows the Seeker only the Registrant\'s reply', async ({ request }) => {
  const registrant_id = await register(request, { known_as: 'Bartholomew', description: 'Red hat', visibility: 'findable' });
  const code = await sendRequest(request, registrant_id);
  const [{ id }] = await pendingFor(request, registrant_id);

  expect((await answer(request, id, { answer: 'yes', reply_message: '  ' })).status()).toBe(400);
  expect((await answer(request, id, { answer: 'yes', reply_message: 'Come to the gym door', reply_contact: '555-0199' })).status()).toBe(204);
  expect(await pendingFor(request, registrant_id)).toEqual([]);
  expect(await (await request.get(`/api/requests/${code}`)).json()).toEqual({
    status: 'yes',
    reply_message: 'Come to the gym door',
    reply_contact: '555-0199',
  });
});

test('Volunteer answers Yes and the Seeker sees the reply', async ({ page, request }) => {
  const registrant_id = await register(request, { known_as: 'Evangelina', description: 'Green coat', visibility: 'findable' });
  const code = await sendRequest(request, registrant_id, { relationship: 'Brother', message: 'Are you okay?' });

  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('shelterCode', 'TEST-0000'));
  await page.reload();
  await page.getByRole('button', { name: 'Requests' }).click();
  const item = page.getByRole('region', { name: 'Pending requests' }).getByRole('listitem').filter({ hasText: 'Evangelina' });
  await expect(item).toContainText('Green coat');
  await expect(item).toContainText('Marta (Brother)');
  await expect(item).toContainText('Are you okay?');

  await item.getByRole('button', { name: "Couldn't find them" }).click();
  await expect(item).toContainText('Tried 1 time');

  await item.getByRole('button', { name: 'Yes' }).click();
  await item.getByLabel('Their message').fill('I am safe, come find me');
  await item.getByLabel('Contact or meeting place (optional)').fill('Front door at noon');
  await item.getByRole('button', { name: 'Send reply' }).click();
  await expect(item).toHaveCount(0);

  await page.getByRole('button', { name: 'Check request' }).click();
  await page.getByLabel('Request Code').fill(code);
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByText('They replied:')).toBeVisible();
  await expect(page.getByText('I am safe, come find me')).toBeVisible();
  await expect(page.getByText('Front door at noon')).toBeVisible();
});

test('the Requests tab shows the pending count and keeps it up to date', async ({ page, request }) => {
  // Quiet Shelter, so requests from other test files don't change the count.
  const headers = { 'X-Shelter-Code': 'TEST-0001' };
  const res = await request.post('/api/registrants', { headers, data: { known_as: 'Octavian', visibility: 'findable' } });
  const registrant_id = (await res.json()).id;

  await page.clock.install();
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('shelterCode', 'TEST-0001'));
  await page.reload();
  await expect(page.getByText('Shelter: Quiet Shelter')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Requests', exact: true })).toBeVisible();

  // A request arrives while the Volunteer is on Register: the count shows within 30 seconds.
  await sendRequest(request, registrant_id);
  await page.clock.runFor(30_000);
  await expect(page.getByRole('button', { name: 'Requests (1)' })).toBeVisible();

  await page.getByRole('button', { name: 'Requests (1)' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Octavian' }).getByRole('button', { name: "No / don't know them" }).click();
  await expect(page.getByRole('button', { name: 'Requests', exact: true })).toBeVisible();
});
