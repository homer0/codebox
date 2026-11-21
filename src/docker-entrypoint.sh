#!/bin/sh
set -eu

# Match the base entrypoint's UID setup before looking up the runtime user.
eval "$(fixuid -q)"

RUNTIME_USER=$(id -un)
SOCKET=/var/run/docker.sock
if [ -e "$SOCKET" ] || [ -L "$SOCKET" ]; then
  if [ ! -S "$SOCKET" ]; then
    echo "Docker socket path is not a Unix socket: $SOCKET" >&2
    exit 1
  fi

  SOCKET_GID=$(stat -c '%g' "$SOCKET")
  SOCKET_GROUP=$(getent group "$SOCKET_GID" | cut -d: -f1)
  if [ -z "$SOCKET_GROUP" ]; then
    SOCKET_GROUP="codebox-docker-$SOCKET_GID"
    sudo groupadd --gid "$SOCKET_GID" "$SOCKET_GROUP"
  fi
  sudo usermod --append --groups "$SOCKET_GROUP" "$RUNTIME_USER"
fi

# Refresh groups before setup; only hand off to the unchanged base entrypoint on success.
exec sudo -E -H -u "$RUNTIME_USER" -- /bin/sh -ec '
  /usr/local/lib/codebox/codebox-entrypoint.sh
  exec /usr/bin/entrypoint.sh "$@"
' codebox-start "$@"
