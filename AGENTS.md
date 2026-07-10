# Repository Guidelines

## Project Structure & Module Organization

Helm is a Tauri 2 desktop terminal: React 19 and TypeScript provide the UI, while Rust owns native capabilities. Frontend code is in `src/`: `components/` contains UI by feature, `store/` contains Zustand state, `agents/` implements data-driven agent detection, `commands/` holds keyboard-command logic, and `ipc/` wraps Tauri calls. Rust commands and PTY handling live in `src-tauri/src/`. Keep static assets in `public/` or `src/assets/`; keep release notes and procedures in `docs/`. Tests for pure TypeScript modules belong in `tests/` as `*.test.ts`.

## Build, Test, and Development Commands

- `npm install` installs JavaScript dependencies (Node 22.6+).
- `npm run tauri dev` starts the desktop app; use this for PTY and native integration work.
- `npm run dev` runs Vite only for UI iteration.
- `npm run build` type-checks and produces the frontend bundle in `dist/`.
- `npm run test` runs all Node built-in unit tests without a GUI.
- `npm run typecheck` and `npm run lint` run TypeScript and ESLint checks.
- `npm run tauri build` packages a production desktop application.

For Rust changes, run `cargo fmt --check` and `cargo clippy` from `src-tauri/` before opening a pull request.

## Coding Style & Naming Conventions

Use TypeScript strict mode and preserve the surrounding two-space indentation, trailing commas, and double-quoted strings. Name React components and TypeScript types in `PascalCase`; use `camelCase` for functions, variables, and file names such as `workspaceGroups.ts`. Keep pure state or parsing logic outside components so it can be tested. ESLint ignores the Rust directory; underscore-prefixed unused values are intentional. Format Rust with `rustfmt`, use `snake_case` functions, and register new Tauri commands in `src-tauri/src/lib.rs` with a matching `src/ipc/` wrapper.

## Testing Guidelines

Add focused Node tests whenever changing pure agent detection, command, focus, or store helper logic. Use descriptive `check("expected behavior", ...)` cases alongside the relevant `tests/<area>.test.ts` file. Run `npm run test`, `npm run typecheck`, and `npm run lint` before submitting; manually verify UI and PTY changes with `npm run tauri dev`.

## Commit & Pull Request Guidelines

Follow the existing Conventional Commit pattern: `feat(sidebar): ...`, `fix(agent): ...`, `test: ...`, `chore: ...`, or `style(notify): ...`. Keep commits scoped and imperative; English or Traditional Chinese summaries both appear in history. Pull requests should explain user-visible behavior, list validation commands, link the related issue when applicable, and include screenshots or recordings for UI changes. Do not commit generated `dist/`, `target/`, credentials, or private update keys.
