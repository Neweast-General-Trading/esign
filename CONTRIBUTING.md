# Contributing

## Workflow

1. Branch from `main`: `git checkout -b feature/short-description`.
2. Make focused commits using [Conventional Commits](https://www.conventionalcommits.org/)
 (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
3. Before pushing run:
   ```bash
   npm run build
   cd server && npm run build
   ```
4. Open a pull request describing **what** changed and **why**, with screenshots for UI work.

## Code style

- TypeScript everywhere; no `any` unless unavoidable.
- Backend: Express handlers in `server/src`; keep document persistence in the store modules.
- Frontend: product pages in `src/pages`; shared helpers in `src/lib`; API calls go through
  `src/lib/api.ts`.
- User-facing text is English.
- Use the existing toast helpers in the UI for notifications instead of `alert()`.

## Never commit

- `.env` files, API keys, passwords, tokens, certificates
- Runtime document JSON (`server/data/`)
- Logs (`*.log`), `dist/`, `dist-mis/`, `node_modules/`

If a secret is committed by mistake, rotate it immediately — removing it from history is
not enough.

Git commits on this repository are authored as **jad.sakour** (`AhmadMkhlalati7@gmail.com`)
only. Do not add `Co-authored-by` or other agent attribution trailers.
