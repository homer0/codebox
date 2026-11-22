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

## Verify a code-server upgrade

1. Read the GitHub release notes from the current `Dockerfile` tag through the target tag using the `github-gh` skill. Confirm the exact Debian tag and required architectures on Docker Hub. Compare the upstream Debian version, `coder` user, sudo setup, and base entrypoint. Flag any changes to the workbench template, manifest route, or extension support.
2. Change the base tag and run `pnpm test`. The unit tests do not replace a real image build and startup check.
3. Build and run with a separate image tag and container name. The normal lifecycle scripts are not isolated; get explicit approval before substituting direct Docker commands. Bind SSH, nginx, and code-server to random loopback ports. Use fresh storage, a disposable password, and a temporary setup directory mounted read-only. Generate a disposable SSH key outside that directory, put only its public key under `setup/ssh-keys/`, and list the filename under `ssh.authorized-keys`. Do not mount the Docker socket, live keys, or live profile for the basic smoke test.
4. Wait for code-server's `/healthz`, then log in with the test password and follow redirects with a cookie jar. Check that the authenticated workbench HTML has the configured title, favicon, and nine touch icon tags. Fetch those icon URLs and check for HTTP 200 and `image/png`. Fetch `/manifest.json` and check the custom name and icon entries. Use a browser if checking workbench rendering or extension activation; HTTP responses alone do not verify either.
5. Check nginx via `/go/8080/healthz`, not `/healthz` on nginx itself. Verify SSH by running `whoami` as `coder` with the disposable key and `IdentitiesOnly=yes` and `IdentityAgent=none` so the host agent cannot exhaust authentication attempts.
6. Compare `code-server --list-extensions` with the expected remote extensions and local VSIX files. Capture startup logs before removing the test container. If an expected extension is missing or another check fails, reproduce it with the previous base tag and the same setup before calling it an upgrade regression.
7. Remove only the temporary container and test data. Report which checks passed, which failed, and which deployment-specific behaviors were not tested. Do not treat a successful build or an isolated HTML rewrite as a passing rollout check.
