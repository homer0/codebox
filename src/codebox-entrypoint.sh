#!/bin/zsh

. ~/.zshrc

echo $(node -e "console.log(process.env)") >> ~/.debug-entry.log

# Git configuration
GIT_USERNAME="${GIT_CONFIG_USERNAME:-coder}"
GIT_EMAIL="${GIT_CONFIG_EMAIL:-coder@example.com}"

sed -i "s/{{GIT_CONFIG_USERNAME}}/$GIT_CONFIG_USERNAME/" ~/.gitconfig
sed -i "s/{{GIT_CONFIG_EMAIL}}/$GIT_CONFIG_EMAIL/" ~/.gitconfig

# Validate SSH keys directory
if [ ! -d "/home/coder/ssh-keys" ]; then
  echo "No .ssh directory found, you need to mount it in /home/coder/ssh-keys"
  exit 1
fi

# Update SSH keys permissions
cp -R ~/ssh-keys ~/.ssh
chmod 0700 ~/.ssh && \
  chmod 600 ~/.ssh/id_rsa && \
  chmod 600 ~/.ssh/id_rsa.pub && \
  cp ~/.ssh/id_rsa.pub ~/.ssh/authorized_keys

# Update oh-my-zsh theme
THEME_CODEBOX_NAME="${CODEBOX_NAME:-codebox}"
sed -i "s/{{CODEBOX_NAME}}/$THEME_CODEBOX_NAME/" ~/.oh-my-zsh/themes/robbyrussell-ssh.zsh-theme

# Set Node default version
NODE_VERSION="${NODE_DEFAULT_VERSION:-16}"
nvm alias default $NODE_VERSION
echo $NODE_VERSION > ~/.nvmrc
nvm use

# Restart SSH service
sudo service ssh restart

# Restart nginx service
sudo service nginx restart
