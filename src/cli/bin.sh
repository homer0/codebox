#!/bin/zsh

# This file is the one called in order to execute the JS CLI. The reason for
# it, is to ensure that the Node version is the one specified by the .node-version.

CODEBOX_CLI_PATH="/home/coder/.codebox/cli"
NODE_VERSION=$(node -v)
NODE_VERSION_FILE=$(cat "${CODEBOX_CLI_PATH}/.node-version")

# Switch node version if the one currently being used is different.
if [ "$NODE_VERSION" != "$NODE_VERSION_FILE" ]; then
  fnm use $NODE_VERSION_FILE
fi

# Output the JS value using print to avoid new lines and extra spaces.
OUTPUT=$(node "${CODEBOX_CLI_PATH}/src/index.js" "$@")
printf "%s" $OUTPUT
