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
