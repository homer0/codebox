#!/bin/zsh

. ~/.zshrc

sed -i.bak 's/cert: false/cert: true/' ~/.config/code-server/config.yaml
