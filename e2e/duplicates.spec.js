const { test, expect } = require('@playwright/test');

const volunteerHeaders = { 'X-Shelter-Code': 'TEST-0000' };
// Another seeded shelter.
const otherShelterHeaders = { 'X-Shelter-Code': 'MAPLE-3907' };

// Names are unusual so tests running in parallel don't match each other's Registrants.
async function register(request, registrant, headers = volunteerHeaders) {
  const res = await request.post('/api/registrants', { headers, data: registrant });
  expect(res.status()).toBe(201);
  return (await res.json()).id;
}

async function possibleMatches(request, params) {
  const res = await request.get('/api/possible-matches', { headers: volunteerHeaders, params });
  expect(res.status()).toBe(200);
  return res.json();
}

test('possible matches need a Shelter Code', async ({ request }) => {
  expect((await request.get('/api/possible-matches', { params: { name: 'Ana' } })).status()).toBe(401);
});

test("possible matches include this shelter's Not findable Registrants, never another shelter's", async ({ request }) => {
  const ours = await register(request, { known_as: 'Philippa', visibility: 'not_findable' });
  const theirsHidden = await register(request, { known_as: 'Philippa', visibility: 'not_findable' }, otherShelterHeaders);
  const theirsFindable = await register(request, { known_as: 'Philippa', visibility: 'findable' }, otherShelterHeaders);
  const ids = (await possibleMatches(request, { name: 'Philippa' })).map((r) => r.id);
  expect(ids).toEqual(expect.arrayContaining([ours, theirsFindable]));
  expect(ids).not.toContain(theirsHidden);
});

test("possible matches never include another shelter's Departed Registrants", async ({ request }) => {
  const theirs = await register(request, { known_as: 'Cornelius', visibility: 'findable' }, otherShelterHeaders);
  const depart = await request.post(`/api/registrants/${theirs}`, { headers: otherShelterHeaders, data: { departed: true } });
  expect(depart.status()).toBe(204);
  expect((await possibleMatches(request, { name: 'Cornelius' })).map((r) => r.id)).not.toContain(theirs);
});

test("possible matches include this shelter's Departed Registrants, in case they come back", async ({ request }) => {
  const ours = await register(request, { known_as: 'Hyacinthe', visibility: 'findable' });
  const depart = await request.post(`/api/registrants/${ours}`, { headers: volunteerHeaders, data: { departed: true } });
  expect(depart.status()).toBe(204);
  expect((await possibleMatches(request, { name: 'Hyacinthe' })).map((r) => r.id)).toContain(ours);
});

test('possible matches contain only id, known-as name, age range, and description', async ({ request }) => {
  const id = await register(request, {
    known_as: 'Seraphina', age_range: '5-12', description: 'Green hat', visibility: 'not_findable',
  });
  const matches = await possibleMatches(request, { name: 'Seraphina', age_range: '5-12' });
  expect(matches).toEqual([{ id, known_as: 'Seraphina', age_range: '5-12', description: 'Green hat' }]);
});

test('Volunteer sees possible existing records before saving, and can save anyway', async ({ page, request }) => {
  await register(request, { known_as: 'Anastasius', age_range: '0-4', description: 'Yellow boots', visibility: 'not_findable' });

  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('shelterCode', 'TEST-0000'));
  await page.reload();
  const form = page.getByRole('form', { name: 'Register someone' });
  await page.getByLabel('Name they go by').fill('Anastasius');
  await form.getByRole('button', { name: '0-4' }).click();
  await form.getByRole('button', { name: 'Findable', exact: true }).click();
  await form.getByRole('button', { name: 'Save', exact: true }).click();

  const matches = form.getByRole('region', { name: 'Possible existing records' });
  await expect(matches.getByRole('listitem')).toHaveCount(1);
  await expect(matches).toContainText('Anastasius (0-4) · Yellow boots');
  await expect(page.getByText('Saved.')).toHaveCount(0);

  // Don't save keeps what was typed, so the Volunteer can fix it or check again.
  await form.getByRole('button', { name: "Don't save" }).click();
  await expect(matches).toHaveCount(0);
  await expect(page.getByLabel('Name they go by')).toHaveValue('Anastasius');
  await form.getByRole('button', { name: 'Save', exact: true }).click();

  await form.getByRole('button', { name: 'Save anyway' }).click();
  await expect(page.getByText('Saved. Anastasius is registered.')).toBeVisible();
  await expect(matches).toHaveCount(0);
});
