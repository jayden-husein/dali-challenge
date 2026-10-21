const { test, expect } = require('@playwright/test');

const volunteerHeaders = { 'X-Shelter-Code': 'TEST-0000' };
const otherShelterHeaders = { 'X-Shelter-Code': 'HERON-4821' };

async function register(request, registrant, headers = volunteerHeaders) {
  const res = await request.post('/api/registrants', { headers, data: registrant });
  expect(res.status()).toBe(201);
  return (await res.json()).id;
}

async function roster(request, headers = volunteerHeaders) {
  const res = await request.get('/api/registrants', { headers });
  expect(res.status()).toBe(200);
  return res.json();
}

test("the roster lists only this shelter's Registrants", async ({ request }) => {
  const id = await register(request, { known_as: 'Aurelio', age_range: '18-64', description: 'Grey beard', visibility: 'not_findable' });
  const elsewhere = await register(request, { known_as: 'Aurelio', visibility: 'findable' }, otherShelterHeaders);

  const ids = (await roster(request)).map((r) => r.id);
  expect(ids).toContain(id);
  expect(ids).not.toContain(elsewhere);
  expect((await roster(request)).find((r) => r.id === id)).toEqual({
    id, known_as: 'Aurelio', age_range: '18-64', description: 'Grey beard', visibility: 'not_findable', departed: false,
  });
  expect((await request.get('/api/registrants')).status()).toBe(401);
});

const change = (request, id, data, headers = volunteerHeaders) => request.post(`/api/registrants/${id}`, { headers, data });

// Its own IP, so the search tests' searches don't count toward the limit.
const searchIds = async (request, name) =>
  (await (await request.get('/api/search', { params: { name }, headers: { 'X-Forwarded-For': '192.0.2.1' } })).json()).map((r) => r.id);

test('a Registrant switched to Not findable leaves search, and comes back when switched back', async ({ request }) => {
  const id = await register(request, { known_as: 'Saoirse', visibility: 'findable' });
  expect(await searchIds(request, 'Saoirse')).toContain(id);

  expect((await change(request, id, { visibility: 'not_findable' })).status()).toBe(204);
  expect(await searchIds(request, 'Saoirse')).not.toContain(id);
  expect((await roster(request)).find((r) => r.id === id).visibility).toBe('not_findable');

  expect((await change(request, id, { visibility: 'findable' })).status()).toBe(204);
  expect(await searchIds(request, 'Saoirse')).toContain(id);
});

test("changing another shelter's Registrant is not found, and bad changes are refused", async ({ request }) => {
  const id = await register(request, { known_as: 'Casimir', visibility: 'findable' });

  expect((await change(request, id, { visibility: 'not_findable' }, otherShelterHeaders)).status()).toBe(404);
  expect((await change(request, id, { departed: true }, otherShelterHeaders)).status()).toBe(404);
  expect((await change(request, 'not-a-uuid', { departed: true })).status()).toBe(404);
  expect((await change(request, id, { visibility: 'maybe' })).status()).toBe(400);
  expect((await change(request, id, { visibility: 'not_findable' }, {})).status()).toBe(401);
  expect(await searchIds(request, 'Casimir')).toContain(id);
});

let ip = 0;
async function sendRequest(request, registrant_id) {
  const headers = { 'X-Forwarded-For': `198.51.101.${++ip}` };
  const res = await request.post('/api/requests', { headers, data: { registrant_id, seeker_name: 'Marta' } });
  expect(res.status()).toBe(201);
  return (await res.json()).request_code;
}

const pendingIds = async (request, registrant_id) =>
  (await (await request.get('/api/pending-requests', { headers: volunteerHeaders })).json())
    .filter((r) => r.registrant_id === registrant_id).map((r) => r.id);

const status = async (request, code) => (await request.get(`/api/requests/${code}`)).json();

test('a Departed Registrant leaves search and the pending list, and comes back if they return', async ({ request }) => {
  const id = await register(request, { known_as: 'Leocadia', visibility: 'findable' });
  const code = await sendRequest(request, id);
  expect(await pendingIds(request, id)).toHaveLength(1);

  expect((await change(request, id, { departed: true })).status()).toBe(204);
  expect(await searchIds(request, 'Leocadia')).not.toContain(id);
  expect((await roster(request)).find((r) => r.id === id).departed).toBe(true);
  expect(await pendingIds(request, id)).toEqual([]);
  expect(await status(request, code)).toEqual({ status: 'passed_on' });

  // A request sent after they left looks the same and never reaches a Volunteer.
  expect(await status(request, await sendRequest(request, id))).toEqual({ status: 'passed_on' });
  expect(await pendingIds(request, id)).toEqual([]);

  expect((await change(request, id, { departed: false })).status()).toBe(204);
  expect(await searchIds(request, 'Leocadia')).toContain(id);
  expect(await pendingIds(request, id)).toHaveLength(2);
});

test('requests to a Registrant switched to Not findable read "passed on" and leave the pending list', async ({ request }) => {
  const id = await register(request, { known_as: 'Evander', visibility: 'findable' });
  const code = await sendRequest(request, id);

  expect((await change(request, id, { visibility: 'not_findable' })).status()).toBe(204);
  expect(await pendingIds(request, id)).toEqual([]);
  expect(await status(request, code)).toEqual({ status: 'passed_on' });
});

test('Volunteer registers someone, hides them, marks them Departed, and back again', async ({ page, request }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('shelterCode', 'TEST-0000'));
  await page.reload();
  await page.getByLabel('Name they go by').fill('Peregrine');
  await page.getByRole('form', { name: 'Register someone' }).getByRole('button', { name: 'Not findable' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  const section = page.getByRole('region', { name: 'Shelter roster' });
  const item = section.getByRole('listitem').filter({ hasText: 'Peregrine' });
  await expect(item.getByRole('button', { name: 'Not findable' })).toHaveAttribute('aria-pressed', 'true');

  await item.getByRole('button', { name: 'Findable', exact: true }).click();
  await expect(item.getByRole('button', { name: 'Findable', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const id = (await roster(request)).find((r) => r.known_as === 'Peregrine').id;
  expect(await searchIds(request, 'Peregrine')).toContain(id);

  await sendRequest(request, id);
  const pending = page.getByRole('region', { name: 'Pending requests' });
  await pending.getByRole('button', { name: 'Refresh' }).click();
  await expect(pending.getByRole('listitem').filter({ hasText: 'Peregrine' })).toHaveCount(1);

  page.once('dialog', (dialog) => dialog.accept());
  await item.getByRole('button', { name: 'Departed' }).click();
  await expect(item).toContainText('Departed');
  await expect(item.getByRole('button', { name: 'Findable', exact: true })).toHaveCount(0);
  await expect(pending.getByRole('listitem').filter({ hasText: 'Peregrine' })).toHaveCount(0);
  expect(await searchIds(request, 'Peregrine')).not.toContain(id);

  await item.getByRole('button', { name: 'Back at this shelter' }).click();
  await expect(item.getByRole('button', { name: 'Findable', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(pending.getByRole('listitem').filter({ hasText: 'Peregrine' })).toHaveCount(1);
  expect(await searchIds(request, 'Peregrine')).toContain(id);
});
