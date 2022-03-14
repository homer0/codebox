#!/bin/zsh

CONTAINER_NAME="codebox-container"
IMAGE_NAME="codebox"
CONTAINER_ID=$(docker ps -a | grep $CONTAINER_NAME | awk '{print $1}')

# STOP AND DELETE CONTAINER IF EXISTS
if [ -n "$CONTAINER_ID" ]; then
  echo "=== Stopping container $CONTAINER_NAME"
  docker stop $CONTAINER_ID
  echo "=== Delete container $CONTAINER_NAME"
  docker rm $CONTAINER_ID
fi

# DELETE IMAGE IF EXISTS
if [ -n "$(docker images | grep $IMAGE_NAME)" ]; then
  echo "=== Delete image $IMAGE_NAME"
  docker rmi $IMAGE_NAME
fi

# BUILD IMAGE
echo "=== Build image $IMAGE_NAME"
docker build -t $IMAGE_NAME \
  --build-arg GIT_CONFIG_USERNAME="homer0" \
  --build-arg GIT_CONFIG_EMAIL="me@homer0.dev" \
  --build-arg CODEBOX_NAME="codebox-test" \
  .

# CREATE CONTAINER
echo "=== Create container $CONTAINER_NAME"
docker run -d --name $CONTAINER_NAME \
  -p 4522:22 \
  -p 4580:80 \
  $IMAGE_NAME

echo "=== Done"
