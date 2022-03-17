#!/bin/zsh

. ~/.zshrc

PASSWORD=$(grep -A3 'password:' ~/.config/code-server/config.yaml | head -n1 | awk '{print $2}')
PREFIX=""
# if password is empty
if [ -z "$PASSWORD" ]; then
  PASSWORD=$(grep -A3 'hashed-password:' ~/.config/code-server/config.yaml | head -n1 | awk '{print $2}')
  PREFIX=" (hashed)"
fi

if [ -z "$PASSWORD" ]; then
  echo "Password not found in config.yaml"
  exit 1
else
  echo "Password$PREFIX: $PASSWORD"
fi
