#!/bin/zsh

. ~/.zshrc

# Stop accepting new connections before validation; failures must leave SSH stopped.
if ! sudo service ssh stop; then
  echo "Unable to stop SSH before setup"
  exit 1
fi
sudo service ssh status >/dev/null 2>&1
SSH_SERVICE_STATUS=$?
# Debian reports 1 for a dead daemon with a stale PID file, and 3 when stopped cleanly.
if [ "$SSH_SERVICE_STATUS" -ne 1 ] && [ "$SSH_SERVICE_STATUS" -ne 3 ]; then
  echo "Unable to confirm SSH is stopped; refusing to replace credentials"
  exit 1
fi

# Persistent server identity is required; never fall back to container-local keys.
if ! sudo /usr/local/lib/codebox/setup-ssh-host-keys.sh; then
  echo "Unable to prepare persistent SSH host identity; SSH remains stopped"
  exit 1
fi

CODEBOX_NAME=$(codeboxcli get-setting name)

# Git configuration
GIT_CONFIG_USERNAME=$(codeboxcli get-setting git.username)
GIT_CONFIG_EMAIL=$(codeboxcli get-setting git.email)

sed -i "s/{{GIT_CONFIG_USERNAME}}/$GIT_CONFIG_USERNAME/" ~/.gitconfig
sed -i "s/{{GIT_CONFIG_EMAIL}}/$GIT_CONFIG_EMAIL/" ~/.gitconfig

# Validate all desired credentials, then replace only managed runtime files.
if ! codeboxcli install-ssh; then
  echo "SSH credential setup failed; SSH remains stopped"
  exit 1
fi

# Make explicitly allowed container variables available to SSH sessions through PAM.
SSH_ENV_VARS=$(codeboxcli get-setting ssh.env --string-list)
sudo truncate -s 0 /etc/codebox-ssh-environment
for SSH_ENV_VAR in ${(f)SSH_ENV_VARS}; do
  if [[ ! $SSH_ENV_VAR =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "Invalid SSH environment variable name: $SSH_ENV_VAR"
    exit 1
  fi

  if [[ ! -v $SSH_ENV_VAR ]]; then
    echo "SSH environment variable is not set: $SSH_ENV_VAR"
    continue
  fi

  SSH_ENV_VALUE=${(P)SSH_ENV_VAR}
  if [[ $SSH_ENV_VALUE == *$'\n'* || $SSH_ENV_VALUE == *$'\r'* ]]; then
    echo "SSH environment variable contains a newline: $SSH_ENV_VAR"
    exit 1
  fi

  printf '%s=%s\n' "$SSH_ENV_VAR" "$SSH_ENV_VALUE" \
    | sudo tee -a /etc/codebox-ssh-environment >/dev/null
done

# Install configured box packages before completing setup.
BOX_PACKAGES=$(codeboxcli get-setting box.packages --string-list)
if [[ -n $BOX_PACKAGES ]]; then
  BOX_PACKAGES_LIST=("${(@f)BOX_PACKAGES}")
  echo "== installing box packages..."
  if ! sudo apt-get update; then
    echo "Unable to refresh package indexes"
    exit 1
  fi
  if ! sudo env DEBIAN_FRONTEND=noninteractive apt-get install --yes -- "${BOX_PACKAGES_LIST[@]}"; then
    echo "Unable to install box packages"
    exit 1
  fi
fi

# Scripts run only after packages succeed and before SSH is restarted.
if ! codeboxcli run-setup-files; then
  echo "Box setup scripts failed; SSH remains stopped"
  exit 1
fi

# Update oh-my-zsh theme
sed -i "s/{{CODEBOX_NAME}}/$CODEBOX_NAME/" ~/.oh-my-zsh/themes/robbyrussell-ssh.zsh-theme

# Set Node default version
NODE_VERSION=$(codeboxcli get-setting node.default-version)
fnm default $NODE_VERSION
echo $NODE_VERSION > ~/.node-version
fnm use

# Update ngrok
ngrok update

# Setup ngrok auth token if provided
if [ -n "$NGROK_AUTH_TOKEN" ]; then
  echo "== validating ngrok auth token..."
  ngrok config add-authtoken "$NGROK_AUTH_TOKEN"
fi

# Write code-server config
CODE_SERVER_CONFIG=$(codeboxcli get-code-server-config --yaml)
echo "== validating code-server config..."
if [ ! -f "~/.config/code-server/config.yaml" ]; then
  mkdir -p ~/.config/code-server
  echo "$CODE_SERVER_CONFIG" > ~/.config/code-server/config.yaml
  echo "=== code-server config successfully created"
else
  echo "=== code-server config already exists"
fi

# Copy VSCode user settings
echo "== validating vscode user settings..."
if [ "$(codeboxcli has vscode.settings)" = "true" ]; then
  if [ ! -f "~/.local/share/code-server/User/settings.json" ]; then
    VSCODE_SETUP_USER_SETTINGS_PATH=$(codeboxcli get-path vscode.settings)
    mkdir -p ~/.local/share/code-server/User
    cp "$VSCODE_SETUP_USER_SETTINGS_PATH" ~/.local/share/code-server/User/settings.json
    echo "=== vscode user settings successfully copied"
  else
    echo "=== vscode user settings already exists"
  fi
else
  echo "=== no custom vscode user settings found"
fi

# Copy VSCode keybindings
echo "== validating vscode user keybindings..."
if [ "$(codeboxcli has vscode.keybindings)" = "true" ]; then
  if [ ! -f "~/.local/share/code-server/User/keybindings.json" ]; then
    VSCODE_SETUP_KEYBINDINGS_PATH=$(codeboxcli get-path vscode.keybindings)
    mkdir -p ~/.local/share/code-server/User
    cp "$VSCODE_SETUP_KEYBINDINGS_PATH" ~/.local/share/code-server/User/keybindings.json
    echo "=== vscode user keybindings successfully copied"
  else
    echo "=== vscode user keybindings already exists"
  fi
else
  echo "=== no custom vscode user keybindings found"
fi

# VSCode extensions
echo "== validating vscode extensions..."
VSCODE_REMOTE_EXTS=$(codeboxcli get-setting vscode.extensions -s)
if [[ -n $VSCODE_REMOTE_EXTS ]]; then
  echo "=== installing remote extensions..."
  VSCODE_REMOTE_EXTS_LIST=($(echo $VSCODE_REMOTE_EXTS))
  for ext in ${VSCODE_REMOTE_EXTS_LIST[@]}; do
    code-server --install-extension "$ext"
  done
else
  echo "=== no remote extensions found"
fi

HAS_VSCODE_LOCAL_EXTS=$(codeboxcli has vscode.extensions)
if [ "$(codeboxcli has vscode.settings)" = "true" ]; then
  VCODE_LOCAL_EXTS_PATH=$(codeboxcli get-path vscode.extensions)
  VSCODE_LOCAL_EXTS=$(ls "$VCODE_LOCAL_EXTS_PATH")
  if [[ -n $VSCODE_LOCAL_EXTS ]]; then
    echo "=== installing local extensions..."
    VSCODE_LOCAL_EXTS_LIST=($(echo $VSCODE_LOCAL_EXTS))
    for ext in ${VSCODE_LOCAL_EXTS_LIST[@]}; do
      code-server --install-extension "$VCODE_LOCAL_EXTS_PATH/$ext"
    done
  else
    echo "=== no local extensions found"
  fi
else
  echo "=== no local extensions found"
fi

if ! codeboxcli install-marketplace-extensions; then
  echo "Marketplace extension setup failed; continuing startup" >&2
fi

# Change code-server PWA settings
ICON=$(codeboxcli get-setting icon)
TPL="/usr/lib/code-server/lib/vscode/out/vs/code/browser/workbench/workbench.html"
ICON_PATH="{{BASE}}\/_static\/src\/browser\/media\/codebox-icons\/$ICON"
NEW_TAGS="\t\n\t\t<!-- Codebox customizations -->\n"
NEW_TAGS+="\t\t<meta name=\"apple-mobile-web-app-title\" content=\"$CODEBOX_NAME\" \/>\n"
NEW_TAGS+="\t\t<link rel=\"shortcut icon\" href=\"$ICON_PATH\/favicon.png\" \/>\n"
ICON_SIZES=(48 72 96 144 192 256 384 512 1024)
for SIZE in $ICON_SIZES; do
  NEW_TAGS+="\t\t<link rel=\"apple-touch-icon\" sizes=\"${SIZE}x${SIZE}\" href=\"$ICON_PATH\/icon-$SIZE.png\">\n"
done
NEW_TAGS+="\t<\/head>"
sudo sed -i "/<link rel=\"apple-touch-icon\"/d" $TPL
sudo sed -i "/<link rel=\"icon\"/d" $TPL
sudo sed -i "/<link rel=\"alternate icon\"/d" $TPL
sudo sed -i "/<meta name=\"apple-mobile-web-app-title\"/d" $TPL
sudo sed -i "s/<\/head>/$NEW_TAGS/" $TPL
PWA_MANIFEST_PATH="/home/coder/_tmp-manifest.json"
VSCODE_ROUTES="/usr/lib/code-server/out/node/routes/vscode.js"
codeboxcli get-pwa-manifest > $PWA_MANIFEST_PATH
sudo env PATH="$PATH" node /usr/local/lib/codebox/patch-pwa-manifest.mjs $PWA_MANIFEST_PATH $VSCODE_ROUTES
rm $PWA_MANIFEST_PATH


# Validate daemon configuration before allowing any new SSH connections.
if ! sudo install -d -m 0755 -o root -g root /run/sshd; then
  echo "Unable to prepare SSH daemon runtime directory; SSH remains stopped"
  exit 1
fi
if ! sudo /usr/sbin/sshd -t; then
  echo "Invalid SSH daemon configuration; SSH remains stopped"
  exit 1
fi
if ! sudo service ssh start; then
  echo "Unable to start SSH after setup"
  sudo service ssh stop
  exit 1
fi

# Restart nginx service
sudo service nginx restart

