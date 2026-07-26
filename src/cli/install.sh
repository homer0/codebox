#!/bin/zsh

# Load the zsh profile so nvm is available.
. ~/.zshrc

# Switch to this file's directory.
DIRPATH=${0:a:h};
cd "$DIRPATH"
# Switch to the required Node version.
fnm use
# Install the dependencies from the lock file. Run pnpm through standalone Corepack:
# fnm's per-shell paths make `corepack enable` shims unavailable in later Docker layers.
NODE_ENV=production corepack pnpm install --frozen-lockfile --prod
