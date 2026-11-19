# 📦 codebox

An image based on [code-server](https://hub.docker.com/r/codercom/code-server) with some extra features.

With code-server, you get a browser based VSCode, and this image adds SSH support, oh-my-zsh, fnm, an nginx reverse proxy for custom ports, and a few more features.

## ⚠️ Disclaimer

I suck at Docker and Bash, so, some of the code may be a bit messy, and it may not follow the best practices. This project is my excuse to learn about both things.

## 🍿 Usage

Since there are a lot of things to configure, and part of the configuration requires files, I decided to avoid splitting things into environment vars and volumes, and just use a readonly volume for the whole configuration.

Mount your setup directory read-only at `/home/coder/.codebox/setup`. It must contain `config.yaml` with a nonempty `ssh.authorized-keys` list and the referenced public-key files in `ssh-keys/`. Outbound private keys are optional and selected independently through SSH client hosts.

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
```

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

SSH host keys are separate from these client credentials. Missing host keys are generated at startup and survive restarts of the same container. **Host-key persistence across container replacement is not implemented**: replacing the container changes its server identity. Verify the new fingerprint through a trusted channel before updating your client's `known_hosts`; do not disable host-key checking as a migration shortcut.

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

| Path                                   | Access | Description                                                                     |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| `/home/coder/.codebox/setup`           | RO     | The setup directory, that contains the SSH keys and the configuration.          |
| `/home/coder/.local/share/code-server` | RW     | The VSCode profile directory, where all configurations and settings are stored. |
| `/home/coder/.config`                  | RW     | Where the code-server configuration is stored                                   |
| `/home/coder/code`                     | RW     | The directory where you'll create your projects.                                |

## 🚦 Ports

| Number | Description                 |
| ------ | --------------------------- |
| `80`   | For the nginx reverse proxy |
| `22`   | For the SSH connection      |
| `8080` | For the code-server         |

## 🚀 Other features

### 🌎 nginx

The container also installs and configures [nginx](https://www.nginx.com) as a reverse proxy for anything that could run in "custom port": going to `/go/[port]/[path]` on the container's `80` port, will be proxied to `:[port]/[path]`.

Let's say you are exposing the port `80` as `8081`, and inside the container, you are running a Node server on port `3000` to try some stuff; you could access it via `http://localhost:8081/go/3000/my-path`.

### 💻 oh-my-zsh

The container installs and configures [oh-my-zsh](https://ohmyz.sh) as a shell. A special detail is that, when you connect via SSH, it uses a different theme that includes the box name as a prefix, other than that, is the default setup.

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
node --test src/cli/test/*.test.js
# Check virtual paths without creating files in the credential directories:
git check-ignore --no-index -v dev/box/ssh-keys/example-key src/ssh/example-key
git ls-files --error-unmatch dev/box/ssh-keys/.keep src/ssh/.keep
```

`pnpm test` is a placeholder, not this test suite. After JavaScript changes, run the repository formatter before `pnpm run lint:all`; use `pnpm run types:check` for the configured TypeScript checks. Markdown-only changes do not require lint/type checks.

| Check group             | Evidence                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration/rendering | Required authorization, exact filenames, public/private roles, encrypted formats, unsafe inputs, raw overrides, and effective client options.                                                                                |
| Managed installation    | Fresh/repeated layout, permissions/ownership, authorization replacement, outbound removal, legacy cleanup, unrelated-file preservation, and invalid destinations.                                                            |
| Agent/unlock            | Socket/PID lifecycle, duplicate-start prevention, real terminal prompts, prompt skipping, cancellation/partial success, raw path discovery, legacy public companions, and loopback authentication with `IdentitiesOnly yes`. |
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
docker run -d --name codebox-ssh-verification \
  -p 127.0.0.1::22 -p 127.0.0.1::8080 \
  -e CODEBOX_VERIFY_MARKER=disposable-runtime-only \
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
| Repeated setup               | Run `docker exec -u coder codebox-ssh-verification /bin/zsh -ic /home/coder/entrypoint.d/codebox-entrypoint.sh`. The layout stays flat and the live managed agent PID is reused. Rerunning unlock skips loaded keys and recreates any required legacy public companion.    |
| Inbound rotation/revocation  | Generate a replacement disposable device key outside the setup directory; replace `setup/ssh-keys/device` with its public key and rerun setup. A new connection with the old private key must fail, while the replacement succeeds. Keep at least one valid authorization. |
| Outbound removal             | Remove `service-two` from the YAML host mapping and rerun setup. Its managed private/public companion files disappear; source files remain untouched.                                                                                                                      |
| Unrelated state              | Create recognizable dummy `known_hosts`/other files before setup. Confirm they survive rotation and removal. Do not use real host entries or keys.                                                                                                                         |
| Invalid inputs while running | Back up the valid YAML, then try an empty `authorized-keys` list and a missing public filename. Each setup rerun must fail and leave `service ssh status` reporting stopped; a new SSH connection must fail. Restore valid YAML before restarting.                         |
| Agent/container restart      | Restore both host entries, restart the container, rediscover host ports, and confirm the agent starts without loaded identities. Unlock again interactively. The disposable probe daemon on port 2222 must also be started again after container restart.                  |
| Browser/editor reuse         | After unlock, repeat browser-terminal SSH and editor Git fetch without exporting or repairing environment variables.                                                                                                                                                       |

Remove only the named verification resources when finished:

```bash
docker rm --force codebox-ssh-verification
docker image rm codebox-ssh-verification:local
```

Then delete only the disposable `$VERIFY_ROOT` directory and its contents. Do not delete your normal mounts, setup directory, or key folders. No real credential should be used anywhere in this workflow.

#### Recorded verification

Verified locally on 2026-11-16 with 35 automated tests, including real OpenSSH terminal prompts and a disposable loopback server. All tests, formatting, lint, type checks, and shell syntax checks passed.

A separate approved isolated build/run verified the actual arm64 Docker image with code-server 4.130.0: fresh/repeated startup, read-only setup, ownership/modes, effective key-only policy, PAM `ssh.env`, interactive encrypted OpenSSH/PKCS#8 unlock over SSH, selected outbound identity use, authorization rotation/revocation, outbound removal, unrelated-file preservation, and invalid-input fail-closed behavior. Container restart cleared loaded keys and required unlocking again. The actual browser terminal reused those unlocked identities, and the editor's Git extension fetched through both selected identities without environment repair.

That run found and corrected two prerequisites: `libatomic1` is needed by the installed Node runtime on arm64, and Debian's dead-daemon/stale-PID status must be accepted as stopped during container restart. The verification container, images, browser instance, and disposable credentials were removed afterward. This evidence covers the tested arm64 environment; it does not claim verification of every host architecture, upstream release, or external service. Host-key persistence across container replacement remains intentionally unimplemented.

### 🛠 Dev configuration

Inside the `dev` directory, you'll find a `dev.yaml` file that contains the configuration that the scripts use to build the image and run the container:

```yaml
names:
  container: codebox-container
  image: codebox
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

## 👾 What comes next?

~~You've been freed~~Yes, one of the motivations of this project was for me to learn some Docker and Bash, but ultimately, it's something I want in order to run it in my local network and be able to code from my tablet, so, I plan to keep working on it and adding stuff as I may need them.

My objective is not to create something that you would deploy "to production", with multiple users, and amazing performance, but just to have an environment where you can code and play with it, without the need of your computer.

For now, this is my _wishlist_:

### Better organization of the CLI app

This thing with the `package*` files in the root, but then moved to the CLI folder, is a bit of a mess, and if you don't read this doc, is not intuitive.

### Custom configuration for oh-my-zsh

Right now, it copies a few of my aliases, and that's all, but it would be great (and not complicated at all), to put some `.sh` file in the setup directory, and then include it in the `.zshrc` file.

### Custom configuration for .git

Just like oh-my-zsh, it could have a custom `.gitconfig` file in the setup directory, and use it to replace the one inside the container.

### oh-my-zsh custom theme

By default, it uses `oh-my-zsh` default theme, `robbyrussell`, and when you connect via SSH, a modified version of it. But, if you want to use a different theme, you could add something like `codebox-theme` and/or `codebox-theme-ssh` in the setup directory, for the container to use.

### Better entrypoint

The thing I'm doing with the entrypoint is not messy, it's **dark AF**: I use `sed` to inject the execution of a bash file before code-server is started... and then, I used `sed` again to replace the execution of code-server in order to support custom domains.

### nginx sites

By default, nginx is only used for the `/go/$PORT` reverse proxy, but it wouldn't be very complicated to be able to copy a site definition (or multiple) from the setup directory. It could even generate an SSL certificate (self-signed) and exposed on a volume, so the host machine can trust it.
