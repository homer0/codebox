#!/bin/sh

. "$(dirname "$0")/settings.sh"

CONTAINER_NAME=$(getsetting names.container)
IMAGE_NAME=$(getsetting names.image)
SSH_HOST_KEYS_VOLUME=$(getsetting volumes.ssh-host-keys) || exit 1
case "$SSH_HOST_KEYS_VOLUME" in
  ''|[!a-zA-Z0-9]*|*[!a-zA-Z0-9_.-]*)
    echo "Configure volumes.ssh-host-keys with a valid named volume"
    exit 1
    ;;
esac
SSH_PORT=$(getsetting ports.ssh)
HTTP_PORT=$(getsetting ports.http)
CODE_SERVER_PORT=$(getsetting ports.code-server)
PWD=$(pwd)
MOUNT_PATH="$PWD/.codebox-mount"
CONFIG_PATH="$MOUNT_PATH$(getsetting paths.mount.config)"
PROFILE_PATH="$MOUNT_PATH$(getsetting paths.mount.profile)"
SETUP_PATH="$PWD$(getsetting paths.setup)"
CODE_PATH="$PWD$(getsetting paths.code)"

DOCKER_ENABLED=$(getsetting docker.enabled) || exit 1
set --
case "$DOCKER_ENABLED" in
  true)
    DOCKER_SOCKET=$(getsetting docker.socket) || exit 1
    case "$DOCKER_SOCKET" in
      /*) ;;
      *) echo "Configure docker.socket with an absolute host socket path"; exit 1 ;;
    esac
    if [ ! -S "$DOCKER_SOCKET" ]; then
      echo "Docker socket not found: $DOCKER_SOCKET (set docker.enabled to false to disable access)"
      exit 1
    fi
    set -- --volume "$DOCKER_SOCKET:/var/run/docker.sock:rw"
    ;;
  false) ;;
  *) echo "Configure docker.enabled as true or false"; exit 1 ;;
esac

echo "=== Cleaning mount paths..."
rm -rf "$MOUNT_PATH"
mkdir -p "$CONFIG_PATH"
mkdir -p "$PROFILE_PATH"
echo "=== Done!"

echo "=== Creating container $CONTAINER_NAME..."
docker run -d --name $CONTAINER_NAME \
  -p $SSH_PORT:22 \
  -p $HTTP_PORT:80 \
  -p $CODE_SERVER_PORT:8080 \
  -v $SETUP_PATH:/home/coder/.codebox/setup:ro \
  -v $CONFIG_PATH:/home/coder/.config:rw \
  -v $PROFILE_PATH:/home/coder/.local/share/code-server:rw \
  -v $CODE_PATH:/home/coder/code:rw \
  --mount "type=volume,src=$SSH_HOST_KEYS_VOLUME,dst=/var/lib/codebox/ssh-host-keys,volume-nocopy" \
  "$@" \
  "$IMAGE_NAME" || exit 1
echo "=== Done!"
