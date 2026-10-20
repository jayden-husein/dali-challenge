const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const { Pool } = require('pg');
const { rateLimit } = require('express-rate-limit');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
// Render's proxy adds the caller's IP to X-Forwarded-For; rate limits key on it.
app.set('trust proxy', 1);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ database: 'reachable' });
  } catch {
    res.status(503).json({ database: 'unreachable' });
  }
});

// Volunteer routes: the Shelter Code picks the shelter for every read and write.
async function requireShelter(req, res, next) {
  const code = req.get('X-Shelter-Code');
  const { rows } = code
    ? await pool.query('SELECT id, name FROM shelters WHERE code = $1', [code])
    : { rows: [] };
  if (!rows[0]) return res.status(401).json({ error: "That Shelter Code didn't work." });
  req.shelter = rows[0];
  next();
}

app.get('/api/shelter', requireShelter, (req, res) => {
  res.json({ name: req.shelter.name });
});

const AGE_RANGES = ['0-4', '5-12', '13-17', '18-64', '65+'];
const VISIBILITIES = ['findable', 'not_findable'];
const optionalText = (value) => (typeof value === 'string' && value.trim()) || null;

app.post('/api/registrants', requireShelter, express.json(), async (req, res) => {
  const { known_as, age_range, description, visibility } = req.body ?? {};
  if (typeof known_as !== 'string' || !known_as.trim()) {
    return res.status(400).json({ error: 'A name is needed.' });
  }
  if (!VISIBILITIES.includes(visibility)) {
    return res.status(400).json({ error: 'Choose Findable or Not findable.' });
  }
  if (age_range != null && !AGE_RANGES.includes(age_range)) {
    return res.status(400).json({ error: 'Unknown age range.' });
  }
  const { rows } = await pool.query(
    `INSERT INTO registrants (shelter_id, known_as, age_range, description, visibility)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, known_as`,
    [req.shelter.id, known_as.trim(), age_range ?? null, optionalText(description), visibility],
  );
  res.status(201).json({ ...rows[0], shelter: req.shelter.name });
});

// Per IP, so nobody can scrape Registrants by searching.
const searchLimit = rateLimit({ windowMs: 60_000, limit: 30, message: { error: 'Too many searches. Wait a minute and try again.' } });

// Open route (ADR 0001): only Findable, non-Departed Registrants, and only these fields.
app.get('/api/search', searchLimit, async (req, res) => {
  const { name, age_range } = req.query;
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Enter a name to search.' });
  }
  if (age_range != null && !AGE_RANGES.includes(age_range)) {
    return res.status(400).json({ error: 'Unknown age range.' });
  }
  // `%` catches misspellings of the whole name, `<%` one part of a longer name.
  // A Registrant with no age range recorded could be any age, so they stay in.
  const { rows } = await pool.query(
    `SELECT id, known_as, age_range, description FROM registrants
     WHERE visibility = 'findable' AND NOT departed AND (known_as % $1 OR $1 <% known_as)
       AND ($2::text IS NULL OR age_range = $2 OR age_range IS NULL)
     ORDER BY word_similarity($1, known_as) DESC
     LIMIT 20`,
    [name.trim(), age_range ?? null],
  );
  res.json(rows);
});

// Plain words that are hard to mishear or misspell. 48 × 48 × 10,000 ≈ 23 million
// Request Codes, so rate-limited guessing is impractical.
const CODE_WORDS = [
  'APPLE', 'BEAR', 'BIRD', 'BOAT', 'BREAD', 'CAKE', 'CHAIR', 'CLOUD', 'CORN', 'DESK',
  'DOOR', 'DRUM', 'DUCK', 'FARM', 'FISH', 'FLAG', 'FROG', 'GOAT', 'GRAPE', 'HAT',
  'HILL', 'HORSE', 'JAR', 'KITE', 'LAKE', 'LAMP', 'LEAF', 'LION', 'MILK', 'MOON',
  'NEST', 'OCEAN', 'PEAR', 'PIANO', 'RAIN', 'RIVER', 'ROBIN', 'ROSE', 'SHELL', 'SHIP',
  'SNOW', 'STAR', 'SUN', 'TIGER', 'TRAIN', 'TREE', 'TRUCK', 'WOLF',
];
const pick = (list) => list[crypto.randomInt(list.length)];
const newRequestCode = () => `${pick(CODE_WORDS)}-${pick(CODE_WORDS)}-${String(crypto.randomInt(10_000)).padStart(4, '0')}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per IP, so nobody can flood Volunteers with requests or guess Request Codes.
const requestLimit = rateLimit({ windowMs: 60_000, limit: 10, message: { error: 'Too many requests sent. Wait a minute and try again.' } });
const checkLimit = rateLimit({ windowMs: 60_000, limit: 30, message: { error: 'Too many checks. Wait a minute and try again.' } });

// Open route. Any existing Registrant gets the request, even Not findable or Departed,
// so the Seeker sees the same answer either way (ADR 0001).
app.post('/api/requests', requestLimit, express.json(), async (req, res) => {
  const { registrant_id, seeker_name, relationship, message, seeker_contact } = req.body ?? {};
  if (typeof seeker_name !== 'string' || !seeker_name.trim()) {
    return res.status(400).json({ error: 'Enter your name.' });
  }
  const { rows } = UUID.test(registrant_id ?? '')
    ? await pool.query('SELECT 1 FROM registrants WHERE id = $1', [registrant_id])
    : { rows: [] };
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  // A clash is rare, so just try a new code.
  for (;;) {
    const request_code = newRequestCode();
    const { rowCount } = await pool.query(
      `INSERT INTO contact_requests (registrant_id, request_code, seeker_name, relationship, message, seeker_contact)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (request_code) DO NOTHING`,
      [registrant_id, request_code, seeker_name.trim(), optionalText(relationship), optionalText(message), optionalText(seeker_contact)],
    );
    if (rowCount) return res.status(201).json({ request_code });
  }
});

// Open route. Only "passed on" until Volunteers can answer; never anything about the Registrant.
app.get('/api/requests/:code', checkLimit, async (req, res) => {
  const { rows } = await pool.query('SELECT 1 FROM contact_requests WHERE request_code = $1', [req.params.code.trim().toUpperCase()]);
  if (!rows[0]) return res.status(404).json({ error: 'No request with that code. Check it and try again.' });
  res.json({ status: 'passed_on' });
});

app.use(express.static(path.join(__dirname, '..', 'dist')));

async function main() {
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Listening on port ${port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
