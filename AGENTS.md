# Project Agent Instructions

## Quick context

- codebox builds a single-user Docker image on `codercom/code-server:39`, adding SSH, nginx, oh-my-zsh, fnm, and a setup-driven CLI.
- Runtime image assets live in `src/`; local Docker development configuration and lifecycle scripts live in `dev/`.

## Project-specific gotchas

- The root `package.json`, lockfile, and `.node-version` are copied into `src/cli`'s image destination by `Dockerfile`; keep them compatible with the CLI dependencies.
- `dev/dev.yaml` drives the image/container names, exposed ports, and local mount paths used by every `dev:*` lifecycle script.
- `pnpm run dev:container:run` deletes and recreates `.codebox-mount`; preserve anything needed from that directory before running it.
- The Docker lifecycle scripts delete the configured container and/or image. Confirm before running the delete, build, run, or `dev:all` commands unless the user explicitly requested that operation.

## Commands that matter

- Use Node 24 (`.node-version`) and pnpm 11.17.0 (`package.json`).
- `pnpm run lint:all` checks all JavaScript. `pnpm run lint` runs staged-file checks through `lint-staged`.
- `pnpm test` is a placeholder command; do not represent it as a test suite.
- `pnpm run dev:image:build` builds the Docker image after deleting its configured container and image. `pnpm run dev:container:run` recreates the configured container. `pnpm run dev:all` performs both.

## Conventions that are easy to miss

- JavaScript uses ESM (`"type": "module"`), two-space indentation, and the shared `@homer0` ESLint/Prettier configurations.
- Keep Docker image changes aligned with the source asset paths copied by `Dockerfile`.
- Commit messages are checked with Conventional Commits by Husky.

## Safety rules

- Do not modify `dev/box/ssh-keys/` or `src/ssh/` key material without explicit user approval.
- Do not run the Docker lifecycle scripts without explicit approval because they stop/remove containers, remove images, and recreate local mounts.
