#!/bin/zsh

# This file is the one called in order to execute the JS CLI. The reason for
# it, is to ensure that the Node version is the one specified by the .nvmrc.

# Load nvm directly, otherwise is not available. And it is not possible to
# include ~/.zshrc because it cause the output to include this file contents,
# no idea why (yet).
. ~/.nvm/nvm.sh

CODEBOX_CLI_PATH="/home/coder/.codebox/cli"
NODE_VERSION=$(node -v)
NVMRC_VERSION=$(cat "${CODEBOX_CLI_PATH}/.nvmrc")

# Switch node version if the one currently being used is different.
if [ "$NODE_VERSION" != "$NVMRC_VERSION" ]; then
  nvm use $NVMRC_VERSION --silent
fi

# Output the JS value using print to avoid new lines and extra spaces.
OUTPUT=$(node "${CODEBOX_CLI_PATH}/src/index.js" "$@")
printf "%s" $OUTPUT
