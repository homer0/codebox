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
mkdir -p ~/.config/code-server
echo "$CODE_SERVER_CONFIG" > ~/.config/code-server/config.yaml
cat ~/.config/code-server/config.yaml

# Restart SSH service
sudo service ssh restart

# Restart nginx service
sudo service nginx restart

