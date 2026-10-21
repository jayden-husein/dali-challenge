// Wipes the test database, recreates the schema, and adds the test shelters.
// Quiet Shelter is for tests that count its records, so other test files can't add to them.
// Runs before the app starts for each test run (see playwright.config.js).
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await client.query(fs.readFileSync(path.join(__dirname, '..', 'server', 'schema.sql'), 'utf8'));
  await client.query(`INSERT INTO shelters (name, code) VALUES ('Test Shelter', 'TEST-0000'), ('Quiet Shelter', 'TEST-0001')`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
