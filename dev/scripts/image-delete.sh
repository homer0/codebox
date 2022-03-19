#!/bin/sh

. "$(dirname "$0")/settings.sh"

IMAGE_NAME=$(getsetting names.image)

if [ -n "$(docker images | grep $IMAGE_NAME)" ]; then
  echo "=== Deleting image $IMAGE_NAME..."
  docker rmi $IMAGE_NAME
  echo "=== Done!"
else
  echo "=== Image $IMAGE_NAME not found"
fi
