# 📦 codebox

An image based on [code-server](https://hub.docker.com/r/codercom/code-server) with some extra features.

## ⚠️ Disclaimer

I suck at Docker and Bash, so some of the code may be a bit messy, and it may not follow the best practices. This project is my excuse to learn about both things.

## 🍿 Usage

Since there are a lot of things to configure, and part of the configuration requires files, I decided to avoid splitting things into environment vars and volumes, and just use a readonly volume for the whole configuration.

The setup directory, that would mount on `/home/coder/.codebox/setup`, only has one requirement: a `ssh-keys` with an `id_rsa` and `id_rsa.pub` files, without password.

```
setup
└── ssh-keys
    ├── id_rsa
    └── id_rsa.pub
```

When the container runs, those keys will be copied to the `.ssh` directory, with the required permissions, and used so you can connect via SSH.

### ⚙️ Configuration

You can also create a `config.yaml` in the setup directory in order to customize the different options available:

```yaml
# The name that shows up in the terminal when you SSH into it
name: my-codebox
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
```

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

> Everything is optional, you could just install extensions, keybindings or settings, or both.

Since you'll me mounting the profile directory too, codebox will only copy the `settings.json` and/or `keybindings.json` if they don't exist already, so you don't need to worry about overwriting them whenever you restart the container.

## 🚀 Other features

### 🌎 nginx

The container also installs and configures [nginx](https://www.nginx.com) as a reverse proxy for anything that could run in "custom port": going to `/go/[port]/[path]` on the container's `80` port, will be proxied to `:[port]/[path]`.

Let's say you are exposing the port `80` as `8081`, and inside the container, you are running a Node server on port `3000` to try some stuff; you could access it via `http://localhost:8081/go/3000/my-path`.

And if you are working with features that require `HTTPS`, even though you'll get the "insecure warning", if you bridge the container with its own IP, you could access the previous example with `https://[IP]/go/3000/my-path`.

### 💻 oh-my-zsh

The container installs and configures [oh-my-zsh](https://ohmyz.sh) as a shell. A special detail is that, when you connect via ssh, it uses a different theme that includes the box name as a prefix, other than that, is the default setup.

### 🧩 nvm

This was originally thought to be a Node development environment, so the container installs [nvm](https://github.com/nvm-sh/nvm), and setups the current LTS versions.

## 🗂 Volumes

| Name | Path | Access | Description |
| ---- | ---- | ------ | ----------- |
| Setup | `/home/coder/.codebox/setup` | RO | The setup directory, that contains the SSH keys and the configuration. |
| Profile | `/home/coder/.local/share/code-server` | RW | The VSCode profile directory, where all configurations and settings are stored. |
| Config | `/home/coder/.config` | RW | Where the code-server configuration is stored |
| Code | `/home/coder/code` | RW | The directory where you'll create your projects. |

