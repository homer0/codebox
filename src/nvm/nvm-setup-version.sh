#!/bin/zsh

. ~/.zshrc

# Install a specific version of Node with nvm, and add some basic packages
# as global.
setupNodeVersion() {
  nvm install $1

  npm install --global\
  vercel\
  diff-so-fancy\
  yarn\
  njt\
}

# Install the current LTS versions
setupNodeVersion 16
setupNodeVersion 14
setupNodeVersion 12

