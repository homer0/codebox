#!/bin/zsh

. ~/.zshrc

# Git configuration
GIT_USERNAME=$(codeboxcli get-setting git.username)
GIT_EMAIL=$(codeboxcli get-setting git.email)

sed -i "s/{{GIT_CONFIG_USERNAME}}/$GIT_CONFIG_USERNAME/" ~/.gitconfig
sed -i "s/{{GIT_CONFIG_EMAIL}}/$GIT_CONFIG_EMAIL/" ~/.gitconfig

# Validate SSH keys directory
if [ "$(codeboxcli has ssh-keys)" = "false" ]; then
  echo "No 'ssh-keys' folder found on your setup directory"
  exit 1
fi

# Update SSH keys permissions
SSH_KEYS_PATH=$(codeboxcli get-path ssh-keys)
cp -R "$SSH_KEYS_PATH" ~/.ssh
chmod 0700 ~/.ssh && \
  chmod 600 ~/.ssh/id_rsa && \
  chmod 600 ~/.ssh/id_rsa.pub && \
  cp ~/.ssh/id_rsa.pub ~/.ssh/authorized_keys

# Update oh-my-zsh theme
THEME_CODEBOX_NAME=$(codeboxcli get-setting name)
sed -i "s/{{CODEBOX_NAME}}/$THEME_CODEBOX_NAME/" ~/.oh-my-zsh/themes/robbyrussell-ssh.zsh-theme

# Set Node default version
NODE_VERSION=$(codeboxcli get-setting node.default-version)
nvm alias default $NODE_VERSION
echo $NODE_VERSION > ~/.nvmrc
nvm use

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

# Restart SSH service
sudo service ssh restart

# Restart nginx service
sudo service nginx restart

