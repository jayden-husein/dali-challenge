const { test, expect } = require('@playwright/test');

const volunteerHeaders = { 'X-Shelter-Code': 'TEST-0000' };

test('Volunteer routes reject a missing or wrong Shelter Code', async ({ request }) => {
  const registrant = { known_as: 'Ana', visibility: 'findable' };
  expect((await request.get('/api/shelter')).status()).toBe(401);
  expect((await request.post('/api/registrants', { data: registrant })).status()).toBe(401);
  const wrong = { 'X-Shelter-Code': 'NOPE-0000' };
  expect((await request.get('/api/shelter', { headers: wrong })).status()).toBe(401);
  expect((await request.post('/api/registrants', { headers: wrong, data: registrant })).status()).toBe(401);
});

test('Shelter Code names its shelter', async ({ request }) => {
  const res = await request.get('/api/shelter', { headers: volunteerHeaders });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ name: 'Test Shelter' });
});

test('registering needs a name and a Visibility', async ({ request }) => {
  for (const data of [
    { known_as: '  ', visibility: 'findable' },
    { known_as: 'Ana' },
    { known_as: 'Ana', visibility: 'maybe' },
    { known_as: 'Ana', visibility: 'findable', age_range: '30' },
  ]) {
    const res = await request.post('/api/registrants', { headers: volunteerHeaders, data });
    expect(res.status(), JSON.stringify(data)).toBe(400);
  }
});

test("a Registrant belongs to the Shelter Code's shelter", async ({ request }) => {
  const res = await request.post('/api/registrants', {
    headers: volunteerHeaders,
    // A typed-in shelter is ignored.
    data: { known_as: 'Ana', visibility: 'not_findable', age_range: '5-12', shelter_id: 1 },
  });
  expect(res.status()).toBe(201);
  expect(await res.json()).toMatchObject({ known_as: 'Ana', shelter: 'Test Shelter' });
});

test('Volunteer enters a Shelter Code and registers someone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Volunteer' }).click();
  await page.getByLabel('Shelter Code').fill('WRONG-1');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText("That Shelter Code didn't work")).toBeVisible();

  await page.getByLabel('Shelter Code').fill('TEST-0000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Shelter: Test Shelter')).toBeVisible();

  await page.getByLabel('Name they go by').fill('Zebulon');
  await page.getByRole('button', { name: '18-64' }).click();
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await page.getByRole('form', { name: 'Register someone' }).getByRole('button', { name: 'Findable', exact: true }).click();
  await save.click();
  await expect(page.getByText('Saved. Zebulon is registered.')).toBeVisible();
  await expect(page.getByLabel('Name they go by')).toHaveValue('');

  // The code is remembered on this device.
  await page.reload();
  await expect(page.getByText('Shelter: Test Shelter')).toBeVisible();
});
