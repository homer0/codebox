#!/bin/zsh

# Load the zsh profile so nvm is available.
. ~/.zshrc

# Switch to this file's directory.
DIRPATH=${0:a:h};
cd "$DIRPATH"
# Switch to the required Node version.
nvm use
# Install the dependencies from the lock file.
npm ci
