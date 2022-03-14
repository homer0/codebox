#!/bin/zsh

. ~/.zshrc

setupNodeVersion() {
  nvm install $1

  npm install --global\
  vercel\
  diff-so-fancy\
  yarn\
  njt\
}

setupNodeVersion 16
setupNodeVersion 14
setupNodeVersion 12
nvm alias default $NODE_DEFAULT_VERSION
echo $NODE_DEFAULT_VERSION > ~/.nvmrc
nvm use
