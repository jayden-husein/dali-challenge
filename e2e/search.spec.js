const { test, expect } = require('@playwright/test');

const volunteerHeaders = { 'X-Shelter-Code': 'TEST-0000' };

// Names are unusual so tests running in parallel don't match each other's Registrants.
async function register(request, registrant) {
  const res = await request.post('/api/registrants', { headers: volunteerHeaders, data: registrant });
  expect(res.status()).toBe(201);
  return (await res.json()).id;
}

const search = async (request, params) => (await request.get('/api/search', { params })).json();

test('a misspelled name finds the right Registrant', async ({ request }) => {
  const id = await register(request, { known_as: 'Thaddeus', visibility: 'findable' });
  const results = await search(request, { name: 'Tadeus' });
  expect(results.map((r) => r.id)).toContain(id);
});

test('one part of a longer name finds the Registrant', async ({ request }) => {
  const id = await register(request, { known_as: 'Octavia Montgomery-Fairweather', visibility: 'findable' });
  const results = await search(request, { name: 'Octavia' });
  expect(results.map((r) => r.id)).toContain(id);
});

test('Not findable Registrants never appear, and their empty search looks like nobody matched', async ({ request }) => {
  await register(request, { known_as: 'Ottoline', visibility: 'not_findable' });
  const hidden = await request.get('/api/search', { params: { name: 'Ottoline' } });
  const nobody = await request.get('/api/search', { params: { name: 'Quillon' } });
  expect(hidden.status()).toBe(200);
  expect(hidden.status()).toBe(nobody.status());
  expect(await hidden.text()).toBe(await nobody.text());
  expect(await hidden.json()).toEqual([]);
});

test('results contain only id, known-as name, age range, and description', async ({ request }) => {
  const id = await register(request, {
    known_as: 'Perpetua', age_range: '65+', description: 'Red raincoat', visibility: 'findable',
  });
  const [result] = await search(request, { name: 'Perpetua' });
  expect(result).toEqual({ id, known_as: 'Perpetua', age_range: '65+', description: 'Red raincoat' });
});

test('the age filter includes Registrants with no age range recorded', async ({ request }) => {
  const child = await register(request, { known_as: 'Wilhelmina', age_range: '5-12', visibility: 'findable' });
  const unknown = await register(request, { known_as: 'Wilhelmina', visibility: 'findable' });
  const adult = await register(request, { known_as: 'Wilhelmina', age_range: '18-64', visibility: 'findable' });
  const ids = (await search(request, { name: 'Wilhelmina', age_range: '5-12' })).map((r) => r.id);
  expect(ids).toEqual(expect.arrayContaining([child, unknown]));
  expect(ids).not.toContain(adult);
});

test('search returns at most 20 results', async ({ request }) => {
  for (let i = 0; i < 21; i++) await register(request, { known_as: 'Bartholomew', visibility: 'findable' });
  expect(await search(request, { name: 'Bartholomew' })).toHaveLength(20);
});

test('too many searches from one IP are rate-limited', async ({ request }) => {
  // Its own IP, so the other tests' searches don't count toward it.
  const headers = { 'X-Forwarded-For': '203.0.113.7' };
  const statuses = [];
  for (let i = 0; i < 31; i++) {
    statuses.push((await request.get('/api/search', { headers, params: { name: 'Anyone' } })).status());
  }
  expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
  expect(statuses[30]).toBe(429);
});

test('Seeker searches by name and sees only what helps them recognise someone', async ({ page, request }) => {
  await register(request, { known_as: 'Evangeline', age_range: '13-17', description: 'Blue backpack', visibility: 'findable' });
  for (let i = 0; i < 20; i++) await register(request, { known_as: 'Leopoldina', visibility: 'findable' });

  await page.goto('/');
  await page.getByLabel('Name or nickname').fill('Evangelin');
  await page.getByRole('button', { name: 'Search' }).click();
  const result = page.getByRole('listitem').filter({ hasText: 'Evangeline' });
  await expect(result).toContainText('13-17');
  await expect(result).toContainText('Blue backpack');
  await expect(page.getByText('Test Shelter')).toHaveCount(0);

  await page.getByLabel('Name or nickname').fill('Leopoldina');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(20);
  await expect(page.getByText('Showing the 20 closest matches. Add an age range or more of the name to narrow it down.')).toBeVisible();

  await page.getByLabel('Name or nickname').fill('Xylophonia');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText(
    'No matches found. They may not be registered yet, or may be using a different name. Try a nickname, check spelling, or search again later.',
  )).toBeVisible();
});
