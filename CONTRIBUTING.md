# Contributing to Open Workflow Editor

Thanks for contributing! This project follows a lightweight Git workflow designed to keep `main` releasable.

## Git workflow

- **`main` is protected** â€” all changes land through pull requests. (Repo setting: *Settings â†’ Branches â†’ Branch protection rules â†’ `main` â†’ require status checks (CI), require up-to-date branch, and disallow force pushes. This must be enabled in GitHub â€” it cannot be configured from the repository contents.)
- **`develop` is the integration branch**: work happens on `feat/â€¦`/`fix/â€¦` branches off `develop`, merges into `develop`, and `develop` merges into `main` for releases. Create `develop` from `main` once and add the same protection settings.
- Every PR should be **small and single-purpose**, with the matching line on the board in [`TODO.md`](TODO.md) flipped to `[~] IN PROGRESS` before coding and `[x]` when done.

## Required checks (must pass before merge)

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run format:check # Prettier
npm test             # Vitest unit tests (69)
npm run test:browser # Playwright E2E (63, parallel workers)
npm run build        # Production bundle
```

The CI workflow (`.github/workflows/ci.yml`) runs the same suite on push and on PRs, uploads the `dist/` bundle as an artifact, and keeps Playwright failure traces as artifacts.

## Local dev

```bash
npm install
npm run dev             # Vite dev server + JS sandbox API on http://127.0.0.1:4174
npm run runtime:sandbox # standalone runtime gateway on 127.0.0.1:8091
```

## Project conventions

- **TypeScript everywhere** (`strict`); no new `.jsx`/`.js` UI code.
- **One source of truth per surface** â€” before adding a control, check [`docs/ide-parity.md`](docs/ide-parity.md) _Control placement map_; status/state indicators must not be duplicated.
- **Persistence keys** live in `src/main.tsx` as `*_KEY` constants â€” extend existing keys with a `:vN` bump rather than introducing overlapping stores.
- **Tests**: unit for pure model/store logic (`src/*.test.ts`), Playwright for user flows (`tests/*.spec.js`); use the existing locators/helpers (e.g. `setSpecText`, `expectSpecToContain`).
- **Docs**: update `README.md`, `docs/ide-parity.md`, `CHANGELOG.md` (Keep-a-Changelog), and the `TODO.md` board in the same change as the feature.

## Commits

Follow the repo style â€” short lowercase prefix (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`) and a body listing what changed; reference the board number (`feat: Task 24 â€” â€¦`) when applicable.
