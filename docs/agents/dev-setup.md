# Local dev setup

Machine: WSL2 (Ubuntu), Node via nvm.

## Postgres

PostgreSQL 18 runs locally as a system service on port 5432 (`pg_lsclusters` shows it). Use it for the Playwright test database rather than Docker (not installed). `pg_trgm` ships with it; enable per database with `CREATE EXTENSION IF NOT EXISTS pg_trgm`.

Tests use the `dali_test` database over the local socket (peer auth, no password). On a fresh machine run `createdb dali_test` once. `npm test` wipes and reseeds it every run, adding the test shelter `TEST-0000`. Override with `TEST_DATABASE_URL`.

To run the app locally: `npm run build`, then `DATABASE_URL='postgresql://%2Fvar%2Frun%2Fpostgresql/<db>' npm start`.

## Playwright

- `@playwright/test` and Chromium are installed. `npm test` runs Playwright; the config resets the test database, builds, and starts the app on port 3001 (so it never reuses a dev server on 3000).
- Chromium's Linux system libraries are already installed. On a fresh WSL machine, Chromium fails to launch with `libnspr4.so: cannot open shared object file` until the user runs the install below.

## sudo with nvm

`sudo npx ...` fails with `npx: command not found` because sudo drops nvm's PATH. Pass it through:

```bash
sudo env "PATH=$PATH" npx playwright install-deps chromium
```

Commands needing sudo need the user's password: hand them the command to run.
