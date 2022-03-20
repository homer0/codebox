#!/bin/sh

. "$(dirname "$0")/settings.sh"

CONTAINER_NAME=$(getsetting names.container)
IMAGE_NAME=$(getsetting names.image)
SSH_PORT=$(getsetting ports.ssh)
HTTP_PORT=$(getsetting ports.http)
HTTPS_PORT=$(getsetting ports.https)
CODE_SERVER_PORT=$(getsetting ports.code-server)
PWD=$(pwd)
MOUNT_PATH="$PWD/.codebox-mount"
CONFIG_PATH="$MOUNT_PATH$(getsetting paths.mount.config)"
PROFILE_PATH="$MOUNT_PATH$(getsetting paths.mount.profile)"
SETUP_PATH="$PWD$(getsetting paths.setup)"
CODE_PATH="$PWD$(getsetting paths.code)"

echo "=== Cleaning mount paths..."
rm -rf "$MOUNT_PATH"
mkdir -p "$CONFIG_PATH"
mkdir -p "$PROFILE_PATH"
echo "=== Done!"

echo "=== Creating container $CONTAINER_NAME..."
docker run -d --name $CONTAINER_NAME \
  -p $SSH_PORT:22 \
  -p $HTTP_PORT:80 \
  -p $HTTPS_PORT:443 \
  -p $CODE_SERVER_PORT:8080 \
  -v $SETUP_PATH:/home/coder/.codebox/setup:ro \
  -v $CONFIG_PATH:/home/coder/.config:rw \
  -v $PROFILE_PATH:/home/coder/.local/share/code-server:rw \
  -v $CODE_PATH:/home/coder/code:rw \
  $IMAGE_NAME
echo "=== Done!"
