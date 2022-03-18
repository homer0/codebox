#!/bin/zsh

. ~/.zshrc

DIRPATH=${0:a:h};
cd "$DIRPATH"
nvm use
npm ci
