const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();

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
