---
name: codebox-setup-cli
description: Use when modifying codebox's setup CLI, its setup configuration contract, or its Docker installation coupling.
---

# Codebox Setup CLI

## Steps

1. Inspect `src/cli/`, `Dockerfile`, and the documented setup configuration in `README.md` before making changes.
2. Preserve the Dockerfile coupling: it copies `src/cli`, `.nvmrc`, `package.json`, and `pnpm-lock.yaml` into `/home/coder/.codebox/cli`, then runs `install.sh` and links `bin.sh` as `codeboxcli`.
3. Keep configuration changes compatible with the setup directory mounted read-only at `/home/coder/.codebox/setup`.
4. Run `pnpm run lint:all` after JavaScript changes. Do not rely on `pnpm test`, which is currently a placeholder.
5. If validating through Docker, obtain explicit approval before running lifecycle scripts because they remove configured Docker resources and recreate `.codebox-mount`.
