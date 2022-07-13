# 📦 codebox

An image based on [code-server](https://hub.docker.com/r/codercom/code-server) with some extra features.

With code-server, you get a browser based VSCode, and this image adds SSH support, oh-my-zsh, nvm, nginx reverse proxy to access ports other than `80` and `443`, and a few more features.

## ⚠️ Disclaimer

I suck at Docker and Bash, so, some of the code may be a bit messy, and it may not follow the best practices. This project is my excuse to learn about both things.

## 🍿 Usage

Since there are a lot of things to configure, and part of the configuration requires files, I decided to avoid splitting things into environment vars and volumes, and just use a readonly volume for the whole configuration.

The setup directory, that would mount on `/home/coder/.codebox/setup`, only has one requirement: a `ssh-keys` with an `id_rsa` and `id_rsa.pub` files, without password.

```
setup
└── ssh-keys
    ├── id_rsa
    └── id_rsa.pub
```

When the container runs, those keys will be copied to the `.ssh` directory, with the required permissions, and used, so you can connect via SSH.

### ⚙️ Configuration

You can also create a `config.yaml` in the setup directory in order to customize the different options available:

```yaml
# The name that shows up in the terminal when you SSH into it, and the suggested
# name to install on iOS.
name: my-codebox
# The icon style to use, one of: default, dark, insiders, sublime, lilac, or acid.
icon: dark
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

## 🗂 Volumes

| Path | Access | Description |
| ---- | ------ | ----------- |
| `/home/coder/.codebox/setup` | RO | The setup directory, that contains the SSH keys and the configuration. |
| `/home/coder/.local/share/code-server` | RW | The VSCode profile directory, where all configurations and settings are stored. |
| `/home/coder/.config` | RW | Where the code-server configuration is stored |
| `/home/coder/code` | RW | The directory where you'll create your projects. |

## 🚦 Ports

| Number | Description |
| ------ | ----------- |
| `80`   | For the nginx reverse proxy |
| `443`  | For the nginx reverse proxy (SSL) |
| `22`   | For the SSH connection |
| `8080` | For the code-server |

## 🚀 Other features

### 🌎 nginx

The container also installs and configures [nginx](https://www.nginx.com) as a reverse proxy for anything that could run in "custom port": going to `/go/[port]/[path]` on the container's `80` port, will be proxied to `:[port]/[path]`.

Let's say you are exposing the port `80` as `8081`, and inside the container, you are running a Node server on port `3000` to try some stuff; you could access it via `http://localhost:8081/go/3000/my-path`.

And if you are working with features that require `HTTPS`, even though you'll get the "insecure warning", if you bridge the container with its own IP, you could access the previous example with `https://[IP]/go/3000/my-path`.

### 💻 oh-my-zsh

The container installs and configures [oh-my-zsh](https://ohmyz.sh) as a shell. A special detail is that, when you connect via SSH, it uses a different theme that includes the box name as a prefix, other than that, is the default setup.

### 🧩 nvm

This was originally thought to be a Node development environment, so the container installs [nvm](https://github.com/nvm-sh/nvm), and setups the current LTS versions.

## 🤘 Development

Inside the `src` directory, you'll find everything that's needed to build the image (besides the `Dockerfile` in the root), and in the `dev` directory, the tools to run customize and run the container.

Now, if you look at the repository, it seems like a JS app, due to the `package.json`, `.eslintrc`, `.nvmrc`, etc; but most of those things are meant for the CLI app that runs inside the container, and that's in charge of configuring the setup. Then, the scripts of the `package.json` also allow you to build/delete the image, and create/delete the container.

### 🤖 Scripts

When the image is created, the `package.json` and the `package-lock.json` are both copied in to the same directory as `src/cli`, but while developing the image, you install the dependencies and use the scripts:

```bash
# Set the Node version
nvm install
# Install the dependencies
npm install

# -----

# You can manually create the image and run the container...

# Build the image, after deleting the container if it was running, and any previous
# version of the image, if it existed.
npm run dev:image:build
# Run the container, after deleting the previous version of the container if it
# was running.
npm run dev:container:run

# -----

# Or use a single script that does both things...
npm run dev:all
```

### 🛠 Dev configuration

Inside the `dev` directory, you'll find a `dev.yaml` file that contains the configuration that the scripts use to build the image and run the container:

```yaml
names:
  container: codebox-container
  image: codebox
ports:
  # 80
  http: 4580
  # 443
  https: 4581
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
