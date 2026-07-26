---
name: docker-dev
description: Use when building, running, inspecting, or deleting the local codebox Docker image or container.
---

# Docker Development

## Steps

1. Read `dev/dev.yaml` and the relevant script in `dev/scripts/` before changing or running a Docker workflow.
2. Treat `dev:container:delete`, `dev:image:delete`, `dev:image:build`, `dev:container:run`, and `dev:all` as destructive: they stop or remove Docker resources, and container runs recreate `.codebox-mount`.
3. Ask for explicit approval before invoking a destructive lifecycle command unless the user already requested that exact operation.
4. Use the package scripts rather than reconstructing `docker build` or `docker run` commands.
5. Report the command run and affected configured image, container, ports, and mounts.
