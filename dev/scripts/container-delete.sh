#!/bin/sh

. "$(dirname "$0")/settings.sh"

CONTAINER_NAME=$(getsetting names.container)
CONTAINER_ID=$(docker ps -a | grep $CONTAINER_NAME | awk '{print $1}')

if [ -n "$CONTAINER_ID" ]; then
  echo "=== Stopping container $CONTAINER_NAME..."
  docker stop $CONTAINER_ID
  echo "=== Done!"
  echo "=== Deleting container $CONTAINER_NAME..."
  docker rm $CONTAINER_ID
  echo "=== Done!"
else
  echo "=== Container $CONTAINER_NAME not found"
fi
