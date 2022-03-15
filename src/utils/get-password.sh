#!/bin/zsh

. ~/.zshrc

echo $(grep -A3 'password:' ~/.config/code-server/config.yaml | head -n1 | awk '{print $2}')
