# Repository Guidelines

## Project Structure & Module Organization
- `server.js`: Node/Express entrypoint (ESM).
- `src/`: Server code. Key areas: `endpoints/` (API routes), `middleware/`, `server-main.js`, `users.js`, `vectors/`.
- `public/`: Frontend assets served by Express (`index.html`, `script.js`, `css/`, `lib.js`).
- `plugins/`: Server plugins (Git repos). Managed via `plugins.js`.
- `data/`: Runtime data (uploads, logs, cache). Ignored by Git.
- `default/`: Seed files copied on first run (e.g., `config.yaml`).
- `tests/`: Jest + Puppeteer tests.
- `docker/`: Container scripts and `docker-compose.yml`.

## Build, Test, and Development Commands
- `npm i`: Install deps and run postinstall (creates defaults).
- `npm start`: Start server on port 8000.
- `npm run debug`: Start with Node inspector.
- `npm run lint` | `npm run lint:fix`: Lint and auto‑fix JS.
- `npm run plugins:update` | `npm run plugins:install <git-url>`: Manage server plugins.
- Tests: `cd tests && npm i && npm test` (expects ST at `http://localhost:8000`).
- Docker: `docker compose -f docker/docker-compose.yml up -d`.

## Coding Style & Naming Conventions
- ESM only (`"type": "module"`). Use `import`/`export`.
- Formatting: 4 spaces, single quotes, semicolons, trailing commas on multiline.
- Filenames: kebab-case (`server-main.js`); variables camelCase; classes PascalCase.
- Run ESLint before pushing; keep changes minimal and focused.

## Testing Guidelines
- Framework: Jest with `jest-puppeteer` (UI e2e). Tests live in `tests/*.test.js`.
- Ensure the app is running at `http://localhost:8000` (or set `global.ST_URL`).
- Prefer deterministic waits (e.g., `waitForFunction`) over sleeps; keep tests fast and isolated.

## Commit & Pull Request Guidelines
- Target branch: `staging` (docs/CI hotfixes may go to `release`).
- Keep PRs small (soft limit ~200 LOC). Allow edits from maintainers; avoid force‑push after review starts.
- Write clear commit messages and PR descriptions: motivation, approach, and test steps. Link related issues; add screenshots for UI changes.
- CI gate: pass lint locally before opening a PR.

## Security & Configuration Tips
- Config lives in `config.yaml` (created by postinstall); never commit secrets. CSRF must stay enabled for production.
- Restrict exposure: use `listen: false` for localhost‑only; avoid `--disableCsrf` except for local debugging.
- Review new plugins and extensions carefully before use.
