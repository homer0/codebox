#!/bin/sh

. "$(dirname "$0")/settings.sh"

IMAGE_NAME=$(getsetting names.image)
echo "=== Building image $IMAGE_NAME..."
docker build -t $IMAGE_NAME .
echo "=== Done!"
