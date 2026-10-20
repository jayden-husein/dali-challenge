# Local dev setup

Machine: WSL2 (Ubuntu), Node via nvm.

## Postgres

PostgreSQL 18 runs locally as a system service on port 5432 (`pg_lsclusters` shows it). Use it for the Playwright test database rather than Docker (not installed). `pg_trgm` ships with it; enable per database with `CREATE EXTENSION IF NOT EXISTS pg_trgm`.

## Playwright

- `@playwright/test` and Chromium are installed. `npm test` runs Playwright; the config starts the app with `npm start` on port 3000.
- Chromium's Linux system libraries are already installed. On a fresh WSL machine, Chromium fails to launch with `libnspr4.so: cannot open shared object file` until the user runs the install below.

## sudo with nvm

`sudo npx ...` fails with `npx: command not found` because sudo drops nvm's PATH. Pass it through:

```bash
sudo env "PATH=$PATH" npx playwright install-deps chromium
```

Commands needing sudo need the user's password: hand them the command to run.
