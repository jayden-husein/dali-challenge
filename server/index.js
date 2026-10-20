const fs = require('node:fs');
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
    [req.shelter.id, known_as.trim(), age_range ?? null, (typeof description === 'string' && description.trim()) || null, visibility],
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
