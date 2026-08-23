# Contributing to Open Workflow Editor

Thanks for contributing! This project follows a lightweight, trunk-based Git workflow designed to keep `main` releasable.

## Git workflow

- **`main` is the trunk and the only long-lived branch** — all changes land on `main` through pull requests. (Repo setting: *Settings → Branches → Branch protection rules → `main` → require status checks (CI), require up-to-date branch, and disallow force pushes. **STATUS (2026-08-23): enabled** via `gh api` — required checks `quality` + `browser` (strict), force pushes denied, `enforce_admins` off so owner direct pushes still work; PR merges require the two CI checks.)
- **One short-lived branch per task, off the latest `main`**: name it `feat/task-<n>-<slug>` (or `fix/task-<n>-<slug>`), matching the board row in [`TODO.md`](TODO.md). Open a PR (or fast-forward merge) back to `main` — there is no `develop` integration branch.
- Every PR should be **small and single-purpose**, with the matching line on the board in [`TODO.md`](TODO.md) flipped to `[~]` IN PROGRESS before coding and `[x]` when done.

### Scaling up later

If a release cadence ever demands stabilization windows, a `develop` (or release-branch) integration model may be adopted — that is a possible future step, **not current practice**. Today everything integrates directly on protected `main`.

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
- **One source of truth per surface** — before adding a control, check [`docs/ide-parity.md`](docs/ide-parity.md) _Control placement map_; status/state indicators must not be duplicated.
- **Persistence keys** live in `src/main.tsx` as `*_KEY` constants — extend existing keys with a `:vN` bump rather than introducing overlapping stores.
- **Tests**: unit for pure model/store logic (`src/*.test.ts`), Playwright for user flows (`tests/*.spec.js`); use the existing locators/helpers (e.g. `setSpecText`, `expectSpecToContain`).
- **Docs**: update `README.md`, `docs/ide-parity.md`, `CHANGELOG.md` (Keep-a-Changelog), and the `TODO.md` board in the same change as the feature.

## Commits

Follow the repo style — short lowercase prefix (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`) and a body listing what changed; reference the board number (`feat: Task 24 — …`) when applicable.
