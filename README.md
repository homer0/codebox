# 📦 codebox

An image based on [code-server](https://hub.docker.com/r/codercom/code-server) with some extra features.

With code-server, you get a browser based VSCode, and this image adds SSH support, oh-my-zsh, fnm, an nginx reverse proxy for custom ports, GitHub CLI, and Docker CLI and Compose support through the host Docker daemon.

- ⚠️ [Disclaimer](#%EF%B8%8F-disclaimer)
- 🍿 [Usage](#-usage)
  - ⚙️ [Configuration](#%EF%B8%8F-configuration)
  - [Box setup scripts](#box-setup-scripts)
  - [SSH credentials](#ssh-credentials)
    - [Authorization and outbound hosts](#authorization-and-outbound-hosts)
    - [Raw overrides](#raw-overrides)
    - [Encrypted keys and the shared agent](#encrypted-keys-and-the-shared-agent)
    - [Updates, failure behavior, and storage](#updates-failure-behavior-and-storage)
    - [Migrating from `id_rsa`](#migrating-from-id_rsa)
  - [Persistent server identity](#persistent-server-identity)
    - [First adoption and migration](#first-adoption-and-migration)
    - [Backup and restore](#backup-and-restore)
    - [Deliberate identity reset](#deliberate-identity-reset)
  - 📝 [VSCode](#-vscode)
- 🗂 [Volumes](#-volumes)
  - [Persistent shell history](#persistent-shell-history)
  - [Project mounts when using the host Docker daemon](#project-mounts-when-using-the-host-docker-daemon)
    - [Option 1: Use a matching neutral path](#option-1-use-a-matching-neutral-path)
    - [Option 2: Pass the host path through an environment variable](#option-2-pass-the-host-path-through-an-environment-variable)
- 🚦 [Ports](#-ports)
- 🚀 [Other features](#-other-features)
  - [Docker](#docker)
  - [GitHub CLI](#github-cli)
  - 🌎 [nginx](#-nginx)
  - 💻 [oh-my-zsh](#-oh-my-zsh)
    - [Custom shell configuration](#custom-shell-configuration)
  - 🧩 [fnm](#-fnm)
- 🤘 [Development](#-development)
  - 🤖 [Scripts](#-scripts)
  - [SSH verification](#ssh-verification)
    - [Automated local checks](#automated-local-checks)
    - [Isolated image workflow](#isolated-image-workflow)
    - [Recorded verification](#recorded-verification)
  - 🛠 [Dev configuration](#-dev-configuration)

## ⚠️ Disclaimer

I suck at Docker and Bash, so, some of the code may be a bit messy, and it may not follow the best practices. This project is my excuse to learn about both things.

## 🍿 Usage

Since there are a lot of things to configure, and part of the configuration requires files, I decided to avoid splitting things into environment vars and volumes, and just use a readonly volume for the whole configuration.

Deployment settings, such as project mounts, Docker socket access, and host-path environment variables, belong in the Compose file or Docker command that creates codebox.

At startup, codebox prepares its runtime UID and optional Docker socket groups, refreshes process groups, and runs codebox setup as the runtime user. If setup exits with an error, startup stops without launching the base entrypoint or code-server. On success, codebox hands control to the unchanged base image entrypoint, which runs any additional `ENTRYPOINTD` hooks and launches code-server with its normal process handling. Codebox's own setup and PWA helper live outside the hooks directory, so they do not run twice.

Mount your setup directory read-only at `/home/coder/.codebox/setup`. It must contain `config.yaml` with a nonempty `ssh.authorized-keys` list and the referenced public-key files in `ssh-keys/`. Outbound private keys are optional and selected independently through SSH client hosts. Also attach a dedicated writable host-key volume at `/var/lib/codebox/ssh-host-keys`; see [persistent server identity](#persistent-server-identity).

```text
setup/
|-- config.yaml
`-- ssh-keys/
    |-- id_my-laptop      # Public key: authorizes incoming connections
    |-- github-personal   # Private key: connects to an external service
    `-- company-server    # A different outbound private key
```

Keep the laptop's private key on the laptop, not inside codebox. Filenames are exact: `id_my-laptop` above contains a public key even though its name has no `.pub` suffix. There is no automatic `id_rsa`/`id_rsa.pub` fallback. See [SSH credentials](#ssh-credentials) and [migration](#migrating-from-id_rsa).

### ⚙️ Configuration

Use `config.yaml` in the setup directory to configure the box. `ssh.authorized-keys` is required; the other sections customize optional behavior:

```yaml
# The name that shows up in the terminal when you SSH into it, and the suggested
# name to install on iOS.
name: my-codebox
# The icon style to use, one of: default, dark, insiders, sublime, lilac, or acid.
icon: dark
# Packages to install whenever the container starts. Starting with a non-empty
# list requires network access to refresh package indexes.
box:
  packages:
    - ffmpeg
  # Absolute container paths to Bash scripts, run in order after packages.
  # Prefix a path with sudo: to run the entire script as root.
  setup-files:
    - /home/coder/.codebox/setup/scripts/tools.sh
    - sudo:/home/coder/.codebox/setup/scripts/system-tools.sh
# Specific options for code-server
code-server:
  # If you reverse proxy it trough a subdomain, like `codebox.homer0.com`, you
  # need to set the name of the domain in here.
  proxy-domain: homer0.com
  # If you want to use HTTPS with a self signed certificate, you can set this
  # to `true`.
  ssl: false
  # A plain password to access the code-server. If not specified, a random string
  # will be generated.
  password: my-password
  # In case you want more security, you can overwrite `password` with your own,
  # custom, hashed password. To create a hashed password, just run this command:
  # `echo -n "my-awesome-password" | npx argon2-cli -e`
  hashed-password: 64aad9f2edfd5658acc3929b840bf0dd64c374a2edd85ee71ec78eafb30740b9
# Specific options for the VSCode editor
vscode:
  # A list of extensions that you would want to install when starting the container.
  # Be aware that these extensions are not from the official VSCode marketpalce, but
  # from open-vsx.org. You can also install extensions from `.vsix` files, but that's
  # documented in the "VSCode section".
  extensions:
    # EditorConfig for VS Code
    - EditorConfig.EditorConfig
    # ESLint
    - dbaeumer.vscode-eslint
# Specific options for GIT
git:
  # The name and email GIT should use for the commits.
  username: homer0
  email: me@homer0.dev
# Incoming authorization and independently selected outbound identities.
ssh:
  authorized-keys:
    - 'id_my-laptop'
  client:
    hosts:
      github-personal:
        hostname: github.com
        user: git
        key: github-personal
        raw:
          IdentitiesOnly: 'no' # Yes by default; this host deliberately overrides it.
      company-server:
        hostname: dev.example.com
        user: developer
        key: company-server
  # Container environment variables to make available in SSH sessions. Only add
  # variables that SSH users need, because their values will be readable there.
  env:
    - MY_APP_TOKEN
    # If project Compose files use this host-path variable over SSH, define its
    # value in codebox's container environment and forward it here.
    - HOST_PROJECTS_PATH
```

For the `HOST_PROJECTS_PATH` example and its deployment configuration, see [passing the host path through an environment variable](#option-2-pass-the-host-path-through-an-environment-variable).

### Box setup scripts

Use `box.setup-files` to run `.sh` files after `box.packages` finishes successfully. It defaults to an empty list. Paths must be absolute paths inside the container, not host paths or paths relative to the setup directory. Mount scripts wherever you need them; the read-only setup mount is one option:

```text
setup/
|-- config.yaml
|-- scripts/
|   |-- tools.sh
|   `-- system-tools.sh
`-- ssh-keys/
```

On every startup, codebox validates the entire list before running any setup script. An optional `sudo:` prefix is stripped before path validation. Each path must name a regular `.sh` file readable by `coder`, including scripts marked with `sudo:`; symlinks to regular files are supported. Files do not need executable permission. Invalid entries, missing files, or unreadable files stop setup without running any scripts, though package installation has already happened.

Scripts run sequentially in separate Bash processes. Plain paths run as `coder` with the container environment and startup working directory; `sudo:<filepath>` runs the entire script as root through `sudo -- /bin/bash -- <filepath>`, using sudo's normal environment filtering. Scripts are responsible for their own file ownership and permissions; codebox does not adjust them afterward. Plain scripts may also call `sudo` themselves when needed. Environment changes and `cd` inside one script do not affect later scripts or codebox. Scripts also run when `box.packages` is empty.

Write scripts to be safe to rerun, avoid interactive prompts, and exit nonzero on failure. Codebox stops at the first failed script, reports its path and exit status or signal, and leaves SSH stopped. Previous package/script changes are not rolled back. Fix the script or configuration and restart the box. Bash uses its normal error handling; add `set -e` or explicit checks in scripts that should stop on a failed command.

Only configure trusted scripts: plain scripts run with the box user's permissions and can use passwordless `sudo`, while `sudo:` scripts run as root. Scripts can access mounted Docker sockets and credentials. The script list and script contents must remain stable while setup runs. Codebox validates paths, not script contents, and does not automatically migrate, copy, or modify the scripts.

### SSH credentials

#### Authorization and outbound hosts

`ssh.authorized-keys` must contain at least one filename. Each file must contain valid OpenSSH public-key lines, not private material or `authorized_keys` option prefixes. Missing/empty authorization, missing files, wrong key roles, unsafe filenames, invalid types, and directive injection fail setup explicitly. This requirement also applies if you normally use only the browser editor.

Both `authorized-keys` entries and each host's `key` resolve from the same read-only `setup/ssh-keys/` directory. Codebox does not append `.pub`, infer a key pair, or use default legacy filenames. Use simple filenames beginning with a letter, digit, or underscore, followed by letters, digits, underscores, dots, or hyphens. Paths and traversal are rejected; symlinks must resolve to a regular file directly inside that directory.

Under `ssh.client.hosts`, each mapping key is a literal SSH alias, not a wildcard. `hostname` becomes `HostName`, `user` becomes `User`, and `key` selects a private file installed as `~/.ssh/codebox-keys/<filename>`. Client hosts are optional. Omitting the client section gives incoming access without configuring outbound identities.

Use the alias, not the real hostname, when selecting an identity:

```bash
ssh company-server
git clone git@github-personal:account/repository.git
# For an existing checkout:
git remote set-url origin git@github-personal:account/repository.git
```

For two accounts on the same service, define two aliases with the same `hostname` and different `key` values. An ordinary `git@github.com:...` URL does not select the `github-personal` alias.

#### Raw overrides

Every host defaults to `IdentitiesOnly yes`, limiting offered agent identities to its selected identity files. The example deliberately sets `github-personal` to `no`; omit that override to keep the safer default.

`raw` accepts nonempty, single-line **strings only**. Quote values such as `'yes'`, `'no'`, and `'22'`; YAML booleans, numbers, lists, and nested mappings are rejected. Option names override generated options case-insensitively, including `HostName`, `User`, `IdentityFile`, and `IdentitiesOnly`. They replace generated values rather than append duplicate directives. Ambiguous names such as both `IdentityFile` and `identityfile` fail validation. `Host`, `Match`, and `Include` are not accepted as host options.

Raw configuration is trusted administrative input: options such as `ProxyCommand` can execute commands when SSH uses them. A raw `IdentityFile` selects an existing runtime path; it does not copy another source file into place. If you also supply `key`, that source key is still validated and installed, even when the raw override selects something else.

#### Encrypted keys and the shared agent

Run this as `coder` in either an incoming SSH terminal or the code-server terminal:

```bash
codeboxcli unlock-ssh-keys
```

The command takes no host arguments. It unlocks all distinct effective configured identities once, respects raw `IdentityFile` overrides, and skips identities already present in the shared agent. OpenSSH owns the interactive passphrase prompts; codebox does not store passphrases, pass them through command arguments, or log them. Startup never waits for unlock. Encrypted-key startup validation checks the container format, not the encrypted private contents; decryption is checked during unlock.

The agent socket is `/home/coder/.codebox/ssh-agent/agent.sock`. SSH sessions, browser terminals, and editor Git processes receive it automatically. Repeated setup checks and reuses a live agent; stale managed instances are checked before replacement. Agent or container restart clears unlocked identities, so run unlock again. Merely reopening a terminal does not require unlocking keys that are still loaded. Other processes running as `coder` can use those unlocked identities; this is a shared-user trust model, not process isolation.

The unlock command discovers identities without executing arbitrary SSH client configuration. Its supported path subset is:

| Effective `IdentityFile`                                                                     | Unlock behavior                                                 |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Literal absolute path or `~/path`                                                            | Resolve the file and deduplicate symlink targets.               |
| Double-quoted literal path, such as `'"~/.ssh/custom key"'` in YAML                          | Support spaces within the single path.                          |
| `none`                                                                                       | Skip this host's identity.                                      |
| Relative path, `~other-user`, `%h`/other tokens, `${HOME}`/other variables, or escape syntax | Report an unsupported case; use a literal runtime path instead. |

Selecting another agent through raw `IdentityAgent` is unsupported by unlock. Remove that override, use the literal `SSH_AUTH_SOCK`, or select the shared socket explicitly. Unsupported discovery and missing files are reported instead of silently loading a superseded key.

Encrypted legacy PEM/PKCS#8 keys need a matching runtime public companion for OpenSSH to select them with `IdentitiesOnly yes`. Unlock can create `<runtime-private-path>.pub` containing only the public key, including each configured symlink path. It never overwrites a conflicting file. Use a writable installed runtime path, and avoid filenames that collide with another installed key's required `.pub` companion. This is not suffix inference in the source directory, and codebox never writes to the read-only setup mount.

Codebox keeps only file-content digests and public agent fingerprints as loaded-key hints. If a legacy key was loaded outside this command, an initial prompt may still be needed. If it cannot be uniquely identified among existing agent keys, unlock fails rather than guess; restart the container for a fresh agent or convert that private key to OpenSSH format. If a runtime public companion conflicts, inspect and correct/remove that specific runtime file before retrying; do not delete the source private key.

A failure or cancelled prompt returns an unsuccessful exit status while preserving successful unlocks. Review the per-key messages and summary, correct the reported problem, and rerun the command. A key may be loaded even if creating its required public companion fails. If a terminal is missing, run the command interactively; if the agent is unavailable, restart the box. A crash-left `setup.lock` requires checking that no setup process is active before removing that specific lock.

#### Updates, failure behavior, and storage

After changing `config.yaml` or source key files, rerun setup by restarting the container. Unlock refuses a client-configuration mismatch until setup has been rerun. Do not use the lower-level `install-ssh` command against a running SSH service; it expects the caller to keep that service stopped.

Setup stops the SSH listener before credential validation. New SSH connections are interrupted until setup succeeds; this does not promise to terminate existing sessions. Invalid inputs or SSH installation/configuration errors leave SSH stopped, rather than start it with stale managed authorization. Fix the source files and restart again. The separate code-server browser password/authentication is unchanged, and an already-running browser editor may remain available when a setup rerun fails.

Codebox manages `~/.ssh/authorized_keys`, `~/.ssh/config`, and `~/.ssh/codebox-keys/`. Authorization is replaced, not appended, so removed public keys stop authorizing new connections. Removed outbound keys disappear from managed storage, and unrelated state such as `known_hosts` is preserved. Managed directories are owned by `coder` with mode `0700`; private keys, configuration, and authorization use `0600`. Files are staged and replaced sequentially, not as a multi-file transaction. Do not hand-edit managed files: setup regenerates them.

Removing a configured outbound key does not revoke it at the external service or guarantee erasure of a copy already loaded in the agent. Restart the agent/container and revoke or rotate the credential at that service when needed. A read-only mount also does not hide its contents: processes with read access can read unselected source keys too. Mount only credentials appropriate for this box.

SSH server host keys are separate from these client credentials. They identify the box to connecting clients and now live in a required persistent volume. Reusing that volume preserves server fingerprints across container replacement; choosing a new empty volume creates a new identity. See the deployment, adoption, backup, and reset guidance below.

#### Migrating from `id_rsa`

1. Back up any custom `~/.ssh/config` or other files you need before the first new setup. Codebox replaces its managed configuration and removes the known legacy runtime files `~/.ssh/id_rsa` and `~/.ssh/id_rsa.pub`; keep needed source copies outside those runtime paths.
2. Prefer separate credentials: put only each connecting device's public key in `setup/ssh-keys/`, and use independently selected private keys for outbound services. Register outbound public keys with their services separately; codebox does not register them for you.
3. Add the required `authorized-keys` list and optional client hosts to `config.yaml`. No legacy file is authorized or selected merely because it exists.
4. If deliberately retaining the old pair, you can list `id_rsa.pub` for incoming access and explicitly select `id_rsa` for an outbound host, as shown below. This retains the exposure of sharing one private key across roles; it is not equivalent to separating credentials.
5. Restart the container, check authorization/client aliases, and run `codeboxcli unlock-ssh-keys` if needed. Update Git remote URLs to use the intended aliases. Rerun unlock after setup if legacy-format public companions need regenerating; already-loaded identities do not need another prompt.

```yaml
ssh:
  authorized-keys:
    - id_rsa.pub
  client:
    hosts:
      github-personal:
        hostname: github.com
        user: git
        key: id_rsa
```

Cleanup is limited to managed paths and the two known legacy default files. Inspect any older nested `~/.ssh/ssh-keys/` copies yourself and remove only copies you recognize and no longer need; codebox does not delete arbitrary user SSH files.

Credential files with arbitrary names in `dev/box/ssh-keys/` and `src/ssh/` are excluded from Git and the Docker build context; `.keep` placeholders remain supported. Do not force-add credentials. Ignore rules do not erase secrets already committed: revoke/rotate any exposed key and handle repository history separately.

### Persistent server identity

Use one dedicated Docker named volume per box, mounted read/write at `/var/lib/codebox/ssh-host-keys`. It is separate from the read-only setup directory, incoming authorization, outbound private keys, and the SSH agent. Independent boxes must use different volume names; sharing one makes them advertise the same server identity.

For example, after building the local `codebox` image and preparing a valid setup directory, create a named volume and attach it explicitly:

```bash
docker volume create codebox-ssh-host-keys
docker run -d --name codebox-container \
  -p 5522:22 -p 5580:80 \
  --mount type=volume,src=codebox-ssh-host-keys,dst=/var/lib/codebox/ssh-host-keys,volume-nocopy \
  --mount type=bind,src=/absolute/path/to/setup,dst=/home/coder/.codebox/setup,readonly \
  codebox
```

Choose unused container/volume names for a new box and add your normal editor/config/workspace mounts as needed. For an existing box, stop/remove only its container and recreate it with the **same named volume**. A typo or different volume name can create a new empty volume and therefore a new identity; verify the mounted source before replacement. Development uses `volumes.ssh-host-keys` in `dev/dev.yaml`, defaulting to `codebox-ssh-host-keys`. Normal `dev:*` image/container replacement keeps the named volume, even though the separate `.codebox-mount` directory is recreated.

The image intentionally does not declare an anonymous Docker volume. Startup requires an actual writable mount at the fixed host-key path and fails SSH setup if it is missing, read-only, or unusable. An explicit writable bind mount can also satisfy that check, but its storage lifecycle is your responsibility; the default and recommended deployment is a named volume. There is no fallback to container-local keys or `/etc/ssh/ssh_host_*` defaults.

A root-owned helper generates only missing Ed25519, ECDSA (nistp256), and RSA keys using OpenSSH defaults. The daemon explicitly selects those persistent files. The directory is `root:root` mode `0700`, private keys are `0600`, and public companions are `0644`. The helper derives public companions from the private keys and never silently replaces an invalid, encrypted, wrong-type, or symlinked private key. Fix the storage or restore a trusted backup before retrying. Concurrent host-key setup fails instead of generating competing identities; its kernel lock releases when the setup process exits.

Persistent server keys are generated only at runtime. Package-generated default host keys are removed in the same build layer as package installation, and no private server key is copied into the image. Do not put host keys in `setup/ssh-keys/`, bake them into a custom image, or make their directory writable by `coder`.

#### First adoption and migration

Adding a **new empty volume** to a box that previously used ephemeral `/etc/ssh` keys changes its server identity once. It does not automatically migrate those old keys. Verify the new public fingerprints through a trusted channel before updating a client's `known_hosts`; never disable host-key checking to hide the change.

```bash
docker exec -u root codebox-container ssh-keygen -l -E sha256 \
  -f /var/lib/codebox/ssh-host-keys/ssh_host_ed25519_key.pub
```

Repeat for the ECDSA/RSA public files if your clients use those algorithms. To preserve an old identity instead, explicitly export the host keys from the **specific old box you own**, while it still exists, into a protected backup and restore the expected `ssh_host_ed25519_key`, `ssh_host_ecdsa_key`, and `ssh_host_rsa_key` files into the new volume before first startup. Older releases stored these in `/etc/ssh`. Never copy keys from an unrelated running resource. No migration or modification of existing real keys is automatic.

#### Backup and restore

Back up after successful setup, or while the box is stopped, not while keys are being initialized. The archive contains **private server keys**: keep it outside repositories, restrict access, and protect any off-machine copy. Only restore archives you trust.

```bash
HOST_KEY_VOLUME=codebox-ssh-host-keys
BACKUP_DIR="$HOME/.local/share/codebox-backups"
mkdir -p "$BACKUP_DIR"
chmod 0700 "$BACKUP_DIR"
umask 077
BACKUP_FILE="$BACKUP_DIR/ssh-host-keys-$(date +%Y%m%d-%H%M%S).tar.gz"
docker volume inspect "$HOST_KEY_VOLUME" >/dev/null && \
  docker run --rm --user root --entrypoint /bin/tar \
    --mount "type=volume,src=$HOST_KEY_VOLUME,dst=/host-keys,readonly" \
    codebox -C /host-keys -czf - . > "$BACKUP_FILE"
```

Inspecting the volume first avoids accidentally backing up a newly created empty volume after a naming mistake. To restore, use a new, unused empty volume and a trusted archive; do not extract over a live identity:

```bash
docker volume create codebox-ssh-host-keys-restored
docker run --rm -i --user root --entrypoint /bin/tar \
  --mount type=volume,src=codebox-ssh-host-keys-restored,dst=/host-keys,volume-nocopy \
  codebox -C /host-keys -xzf - < "$BACKUP_FILE"
```

Recreate the intended box with `codebox-ssh-host-keys-restored` mounted at `/var/lib/codebox/ssh-host-keys` (or change its dev volume setting), then verify fingerprints before retiring the previous volume. Incoming/outbound credentials still come from the setup mount; a host-key backup is not a backup of those credentials or the editor profile.

#### Deliberate identity reset

Deleting this volume is an intentional server identity reset, not normal cleanup. Back it up first if you may need the identity again. Stop and remove every container using it before deletion; adjust these names for the specific box you intend to reset:

```bash
docker stop codebox-container
docker rm codebox-container
docker volume rm codebox-ssh-host-keys
```

Recreate the box with a new empty named volume to generate fresh keys. Verify the new fingerprints and update only the affected trusted host entries. This does not revoke incoming/outbound client keys, and normal development delete/build/run scripts never perform this volume deletion.

### 📝 VSCode

While creating the container, you can also push your custom extensions, settings, and/or keybindings to the VSCode installation, you just need to create a `vscode` directory in the setup directory:

```
setup
├── ssh-keys
└── vscode
    ├── extensions
    │   └── my-extension.vsix
    ├── settings.json
    └── keybindings.json
```

> These VSCode customizations are optional: install extensions, keybindings, settings, or any combination.

Since you'll me mounting the profile directory too, codebox will only copy the `settings.json` and/or `keybindings.json` if they don't exist already, so you don't need to worry about overwriting them whenever you restart the container.

## 🗂 Volumes

| Path                                   | Access | Description                                                                         |
| -------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `/home/coder/.codebox/setup`           | RO     | The setup directory, that contains the SSH keys and the configuration.              |
| `/var/lib/codebox/ssh-host-keys`       | RW     | Required dedicated server-identity volume; root-only, retained across replacements. |
| `/home/coder/.local/share/code-server` | RW     | The VSCode profile directory, where all configurations and settings are stored.     |
| `/home/coder/.config`                  | RW     | Configuration for code-server and tools such as GitHub CLI.                         |
| `/home/coder/.local/state/zsh`         | RW     | Optional persistent shell history; mount the directory, not the history file.       |
| `/home/coder/.oh-my-zsh/custom.sh`     | RO     | Optional custom zsh configuration, sourced after the bundled aliases.               |
| `/home/coder/code`                     | RW     | Conventional project mount; choose your own location using the guidance below.      |
| `/var/run/docker.sock`                 | RW     | Optional host Docker socket; grants codebox control over the host daemon.           |

### Persistent shell history

Zsh stores history at `/home/coder/.local/state/zsh/history` in both SSH sessions and code-server's integrated terminals. Codebox sets `HISTFILE` in `.zshrc` before oh-my-zsh loads, so no container environment variable or `ssh.env` entry is needed.

To retain history when replacing the container, mount a dedicated writable directory or named volume at `/home/coder/.local/state/zsh`. For example, merge this fragment into the Compose file that creates codebox:

```yaml
services:
  codebox:
    volumes:
      - codebox-zsh-history:/home/coder/.local/state/zsh
volumes:
  codebox-zsh-history:
```

Reuse the same volume when replacing the box. Without a mount, history remains in the container's writable layer and is lost when the container is removed. The local dev runner does not add a history mount.

Mount the directory, not an individual `.zsh_history` file: zsh saves history by writing a replacement file and renaming it, which does not work reliably when the file itself is a mount point. A bind-mounted directory must be writable by `coder`; the image prepares the directory with owner-only permissions for new named volumes. Treat history as private data because commands may contain secrets. Use a dedicated history volume for each box rather than sharing your host shell's history file.

For an existing box, close other shell sessions before migrating history. Copy any old `~/.zsh_history` you want to retain to the new directory's `history` file before opening new shells, and ensure the file is owned by `coder` with mode `0600`. Codebox does not migrate the old file automatically.

### Project mounts when using the host Docker daemon

Codebox provides Docker CLI and Compose for use with the host Docker daemon, not a daemon running inside the box. To enable access, mount the host Docker socket at `/var/run/docker.sock` in codebox. Project storage and bind-mount paths remain your responsibility.

You choose where to store and mount your projects. When Docker inside codebox uses the host daemon, bind-mount source paths refer to the **Docker host**, not codebox's filesystem. Choose one of these approaches for projects that use Docker bind mounts.

#### Option 1: Use a matching neutral path

Store projects in a neutral directory such as `/workspace` on the host and mount it at `/workspace` inside codebox. Open projects at that path in code-server or SSH sessions. For example, `/workspace/my-app` must refer to the same project on both sides, so a Compose mount such as `.:/app` resolves to the correct host directory.

Neither the host username nor codebox's `coder` user needs to change. Configure directory permissions so the relevant users can access the files. Mounting a host home directory at `/workspace` inside codebox does not provide matching paths.

#### Option 2: Pass the host path through an environment variable

Keep different host and codebox paths, and use an environment variable for project bind-mount sources. For example, mount the host's `/home/server-user/projects` at `/home/coder/code` inside codebox.

In the Compose file that creates **codebox**, define the host location in the container environment. Merge this fragment into your codebox service alongside its other settings:

```yaml
services:
  codebox:
    environment:
      HOST_PROJECTS_PATH: /home/server-user/projects
    volumes:
      - /home/server-user/projects:/home/coder/code
```

In codebox's setup `config.yaml`, also add the variable name to `ssh.env`, preserving your existing SSH configuration and environment entries:

```yaml
ssh:
  env:
    - HOST_PROJECTS_PATH
```

Both steps are required when running Compose over SSH: define the variable in codebox's container environment **and** include its name in `ssh.env`. Otherwise, the SSH session may use the fallback path and ask the host daemon to mount the wrong directory. Restart codebox after changing its setup, recreate it after changing its container environment, and open a new SSH session.

In the **project's** Compose file, reference the host path:

```yaml
services:
  app:
    volumes:
      - ${HOST_PROJECTS_PATH:-.}/my-app:/app
```

Inside codebox, this mounts `/home/server-user/projects/my-app` from the Docker host, even when you run Compose from `/home/coder/code/my-app`. Outside codebox, when the variable is unset, the fallback is `./my-app`, relative to the Compose file's directory. Choose the variable's base directory and the appended path to suit your project layout; the general pattern is `${SOME_ENV_VAR:-.}/some/path`.

This is explicit configuration, not automatic path translation. Other bind mounts and commands such as `docker run -v "$PWD":/app ...` must also use host-visible source paths. Docker named volumes do not have this path-matching requirement.

Using the host daemon also means published ports belong to the Docker host, not codebox's `localhost`. Access to the Docker socket gives codebox processes effective administrator-level control over that host; only enable it for a trusted box.

See Docker's [bind-mount documentation](https://docs.docker.com/engine/storage/bind-mounts/) for the host-path behavior.

## 🚦 Ports

| Number | Description                 |
| ------ | --------------------------- |
| `80`   | For the nginx reverse proxy |
| `22`   | For the SSH connection      |
| `8080` | For the code-server         |

## 🚀 Other features

### Docker

Docker CLI and Compose are installed in the image. Mounting the host Docker socket is optional: without it or another configured daemon connection, the commands cannot manage containers, but codebox otherwise works normally.

Mount the host socket read/write at `/var/run/docker.sock` (for example, `/var/run/docker.sock:/var/run/docker.sock`). At startup, codebox grants its runtime user access through the socket's numeric group and refreshes process groups before starting code-server. It does not change the host socket's ownership or permissions. A mounted path that is not a Unix socket, or a failure to configure group access, stops startup with an error.

Run `docker`, `docker buildx`, and `docker compose` from code-server's integrated terminal or over SSH using the mounted host Docker socket. Images, build cache, containers, networks, and named volumes belong to the host daemon and are shared with its other Docker clients. No Docker-in-Docker daemon is needed.

Containers started through the host Docker daemon publish ports on the host, not inside codebox. Choose unused host ports; codebox's nginx proxy does not automatically reach those services through its own `localhost`.

Socket access gives codebox effective administrator-level control over the Docker host. Only enable it for a trusted box. For project bind mounts and SSH host-path variables, follow [project mount guidance](#project-mounts-when-using-the-host-docker-daemon).

### GitHub CLI

The image includes `gh`, installed from the [official GitHub CLI Debian repository](https://github.com/cli/cli/blob/trunk/docs/install_linux.md). Run it as `coder` from code-server's integrated terminal or over SSH. Authentication is user-managed; credentials are not included in the image and startup does not prompt for login.

To sign in interactively without generating or uploading SSH keys:

```bash
gh auth login --skip-ssh-key
gh auth status
```

Follow the displayed browser login instructions on your own device. GitHub CLI authentication is separate from codebox's incoming SSH authorization and configured outbound SSH identities.

By default, GitHub CLI stores configuration in `/home/coder/.config/gh`, covered by a persistent `/home/coder/.config` mount. If no usable system credential store is available, `gh` falls back to storing its token in a plain-text configuration file. Protect that mount and its backups as credentials; use `gh auth status` to check the storage location. Credentials held in an external system credential store are not preserved merely by mounting `.config`.

The local dev runner recreates its `.config` mount on each `dev:container:run`, so it does not preserve GitHub CLI file-based login across container replacement. Use your own persistent configuration mount when you need that persistence.

### 🌎 nginx

The container also installs and configures [nginx](https://www.nginx.com) as a reverse proxy for anything that could run in "custom port": going to `/go/[port]/[path]` on the container's `80` port, will be proxied to `:[port]/[path]`.

Let's say you are exposing the port `80` as `8081`, and inside the container, you are running a Node server on port `3000` to try some stuff; you could access it via `http://localhost:8081/go/3000/my-path`.

### 💻 oh-my-zsh

The container installs and configures [oh-my-zsh](https://ohmyz.sh) as a shell. When you connect via SSH, it uses a different theme that includes the box name as a prefix. History uses a dedicated directory so it can be persisted with an optional volume; see [persistent shell history](#persistent-shell-history).

#### Custom shell configuration

Mount a custom file read-only at `/home/coder/.oh-my-zsh/custom.sh` to add aliases, functions, or shell settings without replacing `.zshrc`. Codebox sources it after the bundled aliases, so your definitions can override them. A missing file is ignored.

Create the host file before starting the box and make it readable by `coder`. For example, merge this fragment into the Compose file that creates codebox:

```yaml
services:
  codebox:
    volumes:
      - type: bind
        source: ./custom.sh
        target: /home/coder/.oh-my-zsh/custom.sh
        read_only: true
        bind:
          create_host_path: false
```

Use zsh-compatible syntax. The file is sourced into the current shell, not run as a separate Bash script. It loads in SSH and code-server terminal shells and whenever startup or CLI setup sources `.zshrc`, so keep it safe to source repeatedly and avoid interactive prompts or unconditional output. Later `.zshrc` settings, including fnm, locales, and the CLI path, still run afterward.

Only mount trusted configuration: a read-only mount prevents writes to the file, not execution of its contents. Open a new shell or run `reload` to load changes in an existing shell.

### 🧩 fnm

This was originally thought to be a Node development environment, so the container installs [fnm](https://github.com/Schniz/fnm), and setups the current LTS versions.

## 🤘 Development

Inside the `src` directory, you'll find everything that's needed to build the image (besides the `Dockerfile` in the root), and in the `dev` directory, the tools to run customize and run the container.

Now, if you look at the repository, it seems like a JS app, due to the `package.json`, `.eslintrc`, `.node-version`, etc; but most of those things are meant for the CLI app that runs inside the container, and that's in charge of configuring the setup. Then, the scripts of the `package.json` also allow you to build/delete the image, and create/delete the container.

### 🤖 Scripts

When the image is created, the `package.json` and the `pnpm-lock.yaml` are both copied in to the same directory as `src/cli`, but while developing the image, you install the dependencies and use the scripts:

```bash
# Set the Node version
fnm install
# Install the dependencies
pnpm install

# -----

# You can manually create the image and run the container...

# Build the image, after deleting the container if it was running, and any previous
# version of the image, if it existed.
pnpm run dev:image:build
# Run the container, after deleting the previous version of the container if it
# was running.
pnpm run dev:container:run

# -----

# Or use a single script that does both things...
pnpm run dev:all
```

### SSH verification

#### Automated local checks

Use Node 26, the pinned pnpm version, Python 3, `zsh`, Git, and OpenSSH client/server tools. The tests generate disposable credentials under `/tmp`; the terminal harness uses Python's standard-library `pty` module. They do not need external service accounts or repository key files. The loopback test starts a temporary SSH daemon on an unprivileged local port, using the current local user and disposable authorization.

```bash
pnpm test
# Check virtual paths without creating files in the credential directories:
git check-ignore --no-index -v dev/box/ssh-keys/example-key src/ssh/example-key
git ls-files --error-unmatch dev/box/ssh-keys/.keep src/ssh/.keep
```

`pnpm test` runs all Node test files in `src/cli/test/`, including Docker startup checks with mocked system commands and a temporary Unix socket. Those checks do not require a Docker daemon or modify user groups; actual image installation and Docker connectivity require separate integration verification.

After JavaScript changes, run the repository formatter before `pnpm run lint:all`; use `pnpm run types:check` for the configured TypeScript checks. Markdown-only changes do not require lint/type checks.

| Check group             | Evidence                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration/rendering | Required authorization, exact filenames, public/private roles, encrypted formats, unsafe inputs, raw overrides, and effective client options.                                                                                |
| Managed installation    | Fresh/repeated layout, permissions/ownership, authorization replacement, outbound removal, legacy cleanup, unrelated-file preservation, and invalid destinations.                                                            |
| Agent/unlock            | Socket/PID lifecycle, duplicate-start prevention, real terminal prompts, prompt skipping, cancellation/partial success, raw path discovery, legacy public companions, and loopback authentication with `IdentitiesOnly yes`. |
| Persistent host keys    | Missing-key generation, private-key preservation, public companion repair, invalid/encrypted/symlink rejection, mount/privilege/lock failures, and named dev-volume wiring.                                                  |
| Startup control flow    | Mocked stop/status/start failures and Debian's dead-daemon/stale-PID status after restart.                                                                                                                                   |

#### Isolated image workflow

The normal `dev:*` lifecycle scripts delete the configured image/container and recreate `.codebox-mount`. For isolated verification, use the separate names and disposable directories below instead. These commands still build/run Docker resources: review them first, ensure the verification names are unused, and never substitute your real setup directory or credentials. Image builds download public dependencies.

Create one incoming identity and two encrypted outbound identities. Enter disposable passphrases at OpenSSH's prompts; do not put passphrases in command arguments or scripts.

```bash
VERIFY_ROOT=$(mktemp -d /tmp/codebox-ssh-check.XXXXXX)
mkdir -p "$VERIFY_ROOT/setup/ssh-keys" "$VERIFY_ROOT/config" \
  "$VERIFY_ROOT/profile" "$VERIFY_ROOT/workspace"
chmod 0755 "$VERIFY_ROOT/setup" "$VERIFY_ROOT/setup/ssh-keys"
# Disposable mounts only: permit the container user to write across host UID mappings.
chmod 0777 "$VERIFY_ROOT/config" "$VERIFY_ROOT/profile" "$VERIFY_ROOT/workspace"
ssh-keygen -q -t ed25519 -N '' -f "$VERIFY_ROOT/device"
cp "$VERIFY_ROOT/device.pub" "$VERIFY_ROOT/setup/ssh-keys/device"
ssh-keygen -t ed25519 -f "$VERIFY_ROOT/setup/ssh-keys/service-one"
ssh-keygen -t ed25519 -f "$VERIFY_ROOT/setup/ssh-keys/service-two"
cat "$VERIFY_ROOT/setup/ssh-keys/service-one.pub" \
  "$VERIFY_ROOT/setup/ssh-keys/service-two.pub" > "$VERIFY_ROOT/setup/probe-authorized"
# Test keys only: readable inside the read-only mount; the host parent stays private.
chmod 0444 "$VERIFY_ROOT/setup/ssh-keys/"*
```

Put this configuration in `$VERIFY_ROOT/setup/config.yaml`. Its browser password is deliberately public test data; never use it on a real box. Both outbound aliases target a separate disposable loopback daemon, not an external account.

```yaml
name: ssh-verification
code-server:
  password: disposable-browser-only
ssh:
  authorized-keys:
    - device
  env:
    - CODEBOX_VERIFY_MARKER
  client:
    hosts:
      service-one:
        hostname: 127.0.0.1
        user: coder
        key: service-one
        raw:
          Port: '2222'
          BatchMode: 'yes'
          StrictHostKeyChecking: 'no'
          UserKnownHostsFile: /dev/null
      service-two:
        hostname: 127.0.0.1
        user: coder
        key: service-two
        raw:
          Port: '2222'
          BatchMode: 'yes'
          StrictHostKeyChecking: 'no'
          UserKnownHostsFile: /dev/null
```

Build and run with the setup mount read-only and published ports limited to loopback:

```bash
docker build -t codebox-ssh-verification:local .
HOST_KEY_VOLUME=codebox-ssh-verification-host-keys-a
docker volume create "$HOST_KEY_VOLUME"
docker run -d --name codebox-ssh-verification \
  -p 127.0.0.1::22 -p 127.0.0.1::8080 \
  -e CODEBOX_VERIFY_MARKER=disposable-runtime-only \
  --mount "type=volume,src=$HOST_KEY_VOLUME,dst=/var/lib/codebox/ssh-host-keys,volume-nocopy" \
  --mount "type=bind,src=$VERIFY_ROOT/setup,dst=/home/coder/.codebox/setup,readonly" \
  --mount "type=bind,src=$VERIFY_ROOT/config,dst=/home/coder/.config" \
  --mount "type=bind,src=$VERIFY_ROOT/profile,dst=/home/coder/.local/share/code-server" \
  --mount "type=bind,src=$VERIFY_ROOT/workspace,dst=/home/coder/code" \
  codebox-ssh-verification:local
SSH_PORT=$(docker port codebox-ssh-verification 22/tcp | awk -F: '{print $NF}')
BROWSER_PORT=$(docker port codebox-ssh-verification 8080/tcp | awk -F: '{print $NF}')
docker logs --tail 40 codebox-ssh-verification
curl --fail --max-time 5 "http://127.0.0.1:$BROWSER_PORT/healthz"
```

Wait for successful SSH and code-server startup; if either fails, investigate instead of assuming the checks passed. Docker may assign different ephemeral host ports after `docker restart`; rerun both `docker port` assignments afterward.

Inspect the actual daemon and filesystem, then connect with the disposable incoming identity:

```bash
docker exec -u coder codebox-ssh-verification sudo /usr/sbin/sshd -T \
  -C user=coder,host=localhost,addr=127.0.0.1
docker exec -u coder codebox-ssh-verification stat -c '%a %U %G %n' \
  /home/coder/.ssh /home/coder/.ssh/codebox-keys \
  /home/coder/.ssh/config /home/coder/.ssh/authorized_keys \
  /home/coder/.ssh/codebox-keys/service-one /home/coder/.ssh/codebox-keys/service-two
ssh -p "$SSH_PORT" -i "$VERIFY_ROOT/device" -o IdentitiesOnly=yes \
  -o "UserKnownHostsFile=$VERIFY_ROOT/known_hosts" coder@127.0.0.1
```

Expect `pubkeyauthentication yes`, `passwordauthentication no`, `kbdinteractiveauthentication no`, `authenticationmethods publickey`, `authorizedkeysfile .ssh/authorized_keys`, and `usepam yes`. Expect `coder` ownership, `0700` directories, and `0600` managed files. In that SSH terminal, check `echo "$SSH_AUTH_SOCK"` and `echo "$CODEBOX_VERIFY_MARKER"`, then run `codeboxcli unlock-ssh-keys` and enter the disposable passphrases.

In the container, start a second daemon bound only to loopback. Its relaxed file-ownership check is **only for this disposable probe's host-mounted public authorization file**, not the main SSH service:

```bash
sudo /usr/sbin/sshd -f /etc/ssh/sshd_config -p 2222 \
  -o ListenAddress=127.0.0.1 -o StrictModes=no \
  -o AuthorizedKeysFile=/home/coder/.codebox/setup/probe-authorized \
  -o PidFile=/tmp/codebox-verification-sshd.pid
ssh service-one true
ssh service-two true
ssh -G service-one
```

Both connections must succeed in batch mode after unlock, and effective client configuration must show `identitiesonly yes` and the correct installed `identityfile`.

Open `http://127.0.0.1:<BROWSER_PORT>/?folder=/home/coder/code`, log in with the disposable browser password, trust only this disposable workspace, and create a terminal with **Terminal: Create New Terminal**. Run `codeboxcli unlock-ssh-keys`, `ssh service-one true`, and `ssh service-two true` there. Keys unlocked over SSH should already be loaded, without another prompt.

To check the editor's Git child rather than terminal Git alone, run these commands inside the container to prepare disposable repositories:

```bash
git init --bare /tmp/codebox-verification-remote.git
git -C /home/coder/code init
git -C /home/coder/code config user.name 'Disposable Verification'
git -C /home/coder/code config user.email verification@example.invalid
git -C /home/coder/code config commit.gpgsign false
printf disposable-fixture > /home/coder/code/verification.txt
git -C /home/coder/code add verification.txt
git -C /home/coder/code commit -m 'Disposable verification fixture'
git -C /home/coder/code remote add origin service-one:/tmp/codebox-verification-remote.git
git -C /home/coder/code push origin HEAD:main
git --git-dir=/tmp/codebox-verification-remote.git update-ref refs/heads/editor-check refs/heads/main
```

Use **Git: Fetch** in the browser command palette, then confirm `git -C /home/coder/code show-ref --verify refs/remotes/origin/editor-check` succeeds. Repeat with the other alias by changing the local remote URL to `service-two:/tmp/codebox-verification-remote.git`, creating a new remote branch, and fetching from the UI again. Do not repair `SSH_AUTH_SOCK` manually: the point is to verify inherited editor environment.

Complete this lifecycle checklist using only the disposable source files:

| Scenario                     | Action and expected result                                                                                                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repeated setup               | Run `docker exec -u coder codebox-ssh-verification /bin/zsh -ic /usr/local/lib/codebox/codebox-entrypoint.sh`. The layout stays flat and the live managed agent PID is reused. Rerunning unlock skips loaded keys and recreates any required legacy public companion.      |
| Inbound rotation/revocation  | Generate a replacement disposable device key outside the setup directory; replace `setup/ssh-keys/device` with its public key and rerun setup. A new connection with the old private key must fail, while the replacement succeeds. Keep at least one valid authorization. |
| Outbound removal             | Remove `service-two` from the YAML host mapping and rerun setup. Its managed private/public companion files disappear; source files remain untouched.                                                                                                                      |
| Unrelated state              | Create recognizable dummy `known_hosts`/other files before setup. Confirm they survive rotation and removal. Do not use real host entries or keys.                                                                                                                         |
| Invalid inputs while running | Back up the valid YAML, then try an empty `authorized-keys` list and a missing public filename. Each setup rerun must fail and leave `service ssh status` reporting stopped; a new SSH connection must fail. Restore valid YAML before restarting.                         |
| Agent/container restart      | Restore both host entries, restart the container, rediscover host ports, and confirm the agent starts without loaded identities. Unlock again interactively. The disposable probe daemon on port 2222 must also be started again after container restart.                  |
| Browser/editor reuse         | After unlock, repeat browser-terminal SSH and editor Git fetch without exporting or repairing environment variables.                                                                                                                                                       |

Also record all three public host-key fingerprints, restart the container, and replace it while reattaching `$HOST_KEY_VOLUME`; the fingerprints and a pinned client login must remain unchanged. A second **new disposable volume** must produce different fingerprints. Exercise the backup/restore instructions with a third disposable volume and confirm restored fingerprints match, substituting the verification image and fixture volume names for every deployment default in those examples. Missing/read-only mounts and a deliberately invalid key in a disposable volume must leave SSH stopped without regenerating that invalid private key. Never perform those negative checks on real host keys.

Remove only the named verification resources when finished. Removing a fixture volume below is deliberate destructive cleanup, not a normal replacement step; do not substitute a production volume:

```bash
docker rm --force codebox-ssh-verification
docker image rm codebox-ssh-verification:local
docker volume rm "$HOST_KEY_VOLUME"
# Explicitly remove any separately named fresh/restore fixture volumes too.
```

Then delete only the disposable `$VERIFY_ROOT` directory and its contents. Do not delete your normal mounts, setup directory, or key folders. No real credential should be used anywhere in this workflow.

#### Recorded verification

Verified locally on 2026-11-16 with 42 automated tests, including real OpenSSH terminal prompts, persistent host-key helper checks, and a disposable loopback server. All tests, formatting, lint, type checks, and shell syntax checks passed.

A separate approved isolated build/run verified the actual arm64 Docker image with code-server 4.130.0: fresh/repeated startup, read-only setup, ownership/modes, effective key-only policy, PAM `ssh.env`, interactive encrypted OpenSSH/PKCS#8 unlock over SSH, selected outbound identity use, authorization rotation/revocation, outbound removal, unrelated-file preservation, and invalid-input fail-closed behavior. Container restart cleared loaded keys and required unlocking again. The actual browser terminal reused those unlocked identities, and the editor's Git extension fetched through both selected identities without environment repair.

That run found and corrected two prerequisites: `libatomic1` is needed by the installed Node runtime on arm64, and Debian's dead-daemon/stale-PID status must be accepted as stopped during container restart. The verification container, images, browser instance, and disposable credentials were removed afterward. This evidence covers the tested arm64 environment; it does not claim verification of every host architecture, upstream release, or external service. Persistent host identity was additionally verified in the actual arm64 image: all three fingerprints survived restart and same-volume replacement; a separate fresh volume produced different identities; protected backup/restore preserved the original fingerprints. Incoming SSH, encrypted client-key unlock, shared-agent use, and outbound SSH remained functional. Missing/read-only mounts and an invalid private host key failed closed without ephemeral fallback or silent regeneration. An exported-layer scan found no private server host keys in any image layer. Only explicitly approved disposable volumes were deleted afterward.

### 🛠 Dev configuration

Inside the `dev` directory, you'll find a `dev.yaml` file that contains the configuration that the scripts use to build the image and run the container:

```yaml
names:
  container: codebox-container
  image: codebox
volumes:
  # Keep this named volume when replacing this box; choose another name for a different box.
  ssh-host-keys: codebox-ssh-host-keys
docker:
  # Grants the dev box control over the host daemon; set false to omit the socket.
  enabled: true
  # Absolute host socket path; change for rootless Docker or a custom installation.
  socket: /var/run/docker.sock
ports:
  # 80
  http: 4580
  # 22
  ssh: 4522
  # 8080
  code-server: 6580
paths:
  # The mount paths are relative to $PWD/.codebox-mount
  mount:
    config: /config
    profile: /profile
  # The rest of the path are relative to $PWD
  setup: /dev/box
  code: /
```

Local development enables host Docker access by default. Set `docker.enabled` to `false` in `dev/dev.yaml` to disable it. When enabled, `docker.socket` must point to an existing Unix socket on the machine running the dev script; it is mounted at `/var/run/docker.sock` inside codebox. The runner validates these settings before clearing `.codebox-mount`. It does not change project mount paths or define host-path variables for your projects; follow the [project mount guidance](#project-mounts-when-using-the-host-docker-daemon).

## 👾 What comes next?

~~You've been freed~~Yes, one of the motivations of this project was for me to learn some Docker and Bash, but ultimately, it's something I want in order to run it in my local network and be able to code from my tablet, so, I plan to keep working on it and adding stuff as I may need them.

My objective is not to create something that you would deploy "to production", with multiple users, and amazing performance, but just to have an environment where you can code and play with it, without the need of your computer.

For now, this is my _wishlist_:

### Better organization of the CLI app

This thing with the `package*` files in the root, but then moved to the CLI folder, is a bit of a mess, and if you don't read this doc, is not intuitive.

### Custom configuration for .git

Just like oh-my-zsh, it could have a custom `.gitconfig` file in the setup directory, and use it to replace the one inside the container.

### oh-my-zsh custom theme

By default, it uses `oh-my-zsh` default theme, `robbyrussell`, and when you connect via SSH, a modified version of it. But, if you want to use a different theme, you could add something like `codebox-theme` and/or `codebox-theme-ssh` in the setup directory, for the container to use.

### nginx sites

By default, nginx is only used for the `/go/$PORT` reverse proxy, but it wouldn't be very complicated to be able to copy a site definition (or multiple) from the setup directory. It could even generate an SSL certificate (self-signed) and exposed on a volume, so the host machine can trust it.
