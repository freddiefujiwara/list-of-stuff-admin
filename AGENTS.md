# Repository Guidelines

## Project Structure & Module Organization
- `index.html` and `vite.config.mjs` define the Vite entrypoint and build/test config.
- `src/` holds the Vue app: `src/App.vue`, `src/main.js`, `src/components/`, `src/utils/`, and static assets in `src/assets/`.
- `tests/unit/` contains Vitest unit tests (e.g., `App.spec.js`).

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run serve`: start the Vite dev server for local development.
- `npm run build`: build production assets into `dist/`.
- `npm test`: run Vitest once and enforce 100% coverage (lines, functions, branches, statements).
- `npm run coverage`: same as `npm test`.

## Coding Style & Naming Conventions
- Use 2-space indentation and keep Vue SFC sections ordered `template`, `script`, `style`.
- Components are `PascalCase` (`Item.vue`), utilities are `camelCase` (`shuffleItems`), and tests end with `.spec.js`.
- Prefer composition API patterns (`<script setup>`) as used in `src/App.vue`.
- No lint/format tooling is configured; keep changes consistent with surrounding files.

## Testing Guidelines
- Testing framework: Vitest + Vue Test Utils, environment is `jsdom` (see `vite.config.mjs`).
- New features should include unit tests under `tests/unit/` with matching `.spec.js` names.
- Coverage must remain 100%; run `npm run coverage` before opening a PR.

## Commit & Pull Request Guidelines
- Commit messages are short and imperative, sometimes including a PR/issue suffix like `(#14)`.
- If relevant, use a light scope prefix (e.g., `docs:`) as seen in history.
- PRs should describe the change, link related issues, and include screenshots or GIFs for UI changes.
- Confirm tests pass and note any configuration changes (e.g., API endpoints in `src/App.vue`).

## Configuration Notes
- The API URL is currently a placeholder in `src/App.vue`; update it carefully and document the source.
- Asset references should live in `src/assets/` and be imported via the `@` alias (`@/assets/...`).
