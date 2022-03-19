#!/bin/zsh

. ~/.nvm/nvm.sh

CODEBOX_CLI_PATH="/home/coder/.codebox/cli"
NODE_VERSION=$(node -v)
NVMRC_VERSION=$(cat "${CODEBOX_CLI_PATH}/.nvmrc")
# IF THE VERSIONS ARE DIFFERENT
if [ "$NODE_VERSION" != "$NVMRC_VERSION" ]; then
  nvm use $NVMRC_VERSION --silent
fi

OUTPUT=$(node "${CODEBOX_CLI_PATH}/src/index.js" "$@")
printf "%s" $OUTPUT
