#!/bin/zsh

. ~/.zshrc

# Install a specific version of Node with fnm, and add some basic packages
# as global.
setupNodeVersion() {
  fnm install $1

  npm install --global\
  vercel\
  diff-so-fancy\
  yarn\
  pnpm\
  njt\
  corepack\
}

# Install the current LTS versions
setupNodeVersion 20
setupNodeVersion 22
setupNodeVersion 24
