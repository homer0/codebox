FROM codercom/code-server

# Install dependencies

## apt packages
RUN sudo apt update && sudo apt install openssh-server nginx locales-all -y

## oh-my-zsh
RUN sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Replace oh-my-zsh theme
COPY ./src/oh-my-zsh/robbyrussell-ssh.zsh-theme /home/coder/.oh-my-zsh/themes/
RUN sed -i "s/ZSH_THEME=\"robbyrussell\"/if [[ -n \$SSH_CONNECTION ]]; then\n  ZSH_THEME=\"robbyrussell-ssh\"\nelse\n  ZSH_THEME=\"robbyrussell\"\nfi/" /home/coder/.zshrc

# Add aliases
COPY ./src/oh-my-zsh/user-configuration.sh /home/coder/.oh-my-zsh/user-configuration.sh
RUN sed -i "s/# User configuration/# User configuration\n\nsource \/home\/coder\/.oh-my-zsh\/user-configuration.sh/" /home/coder/.zshrc

# nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
RUN chown -R coder:coder /home/coder/.nvm
COPY ./src/nvm/nvm-config.sh /home/coder/.oh-my-zsh/nvm-config.sh
RUN echo "\n# NVM configuration\n\nsource ~/.oh-my-zsh/nvm-config.sh\n" >> .zshrc
COPY ./src/nvm/nvm-setup-version.sh /home/coder/.nvm-setup-version.sh
RUN sudo chmod +x /home/coder/.nvm-setup-version.sh
RUN sudo chown coder:coder /home/coder/.nvm-setup-version.sh
RUN /home/coder/.nvm-setup-version.sh
RUN rm /home/coder/.nvm-setup-version.sh

# Entrypoint customization
RUN mkdir /home/coder/entrypoint.d
COPY ./src/codebox-entrypoint.sh /home/coder/entrypoint.d/codebox-entrypoint.sh
RUN sudo chmod +x /home/coder/entrypoint.d/codebox-entrypoint.sh
ENV ENTRYPOINTD=/home/coder/entrypoint.d

# Customize execution command
COPY ./src/command-overwrite.sh /home/coder/command-overwrite.sh
RUN sudo chmod +x /home/coder/command-overwrite.sh
RUN sudo /home/coder/command-overwrite.sh
RUN rm /home/coder/command-overwrite.sh

# Configure GIT
COPY ./src/git/.gitconfig /home/coder/.gitconfig
COPY ./src/git/.gitignore_global /home/coder/.gitignore_global

# Fix locales
RUN locale-gen en_US.UTF-8
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8
RUN echo "# Locales\n\nexport LC_ALL=$LC_ALL\nexport LANGUAGE=$LANGUAGE\nexport LANG=$LANG\n" >> /home/coder/.zshrc

# Change permissions for the PWA setup
RUN sudo chmod 0755 /usr/lib/code-server/out/node/routes/vscode.js

# Replace shell
RUN sudo chsh -s $(which zsh)
RUN sudo usermod -s $(which zsh) coder

# Setup SSH
RUN sudo sed -i "s/#PasswordAuthentication yes/PasswordAuthentication no/" /etc/ssh/sshd_config
RUN sudo sed -i "s/UsePAM yes/UsePAM no/" /etc/ssh/sshd_config

# Setup nginx
COPY ./src/nginx/default-site /etc/nginx/sites-available/default

# Add VS Code icons
COPY ./src/vscode/icons /usr/lib/code-server/src/browser/media/codebox-icons

# Setup CLI
RUN mkdir -p /home/coder/.codebox/cli
COPY ./src/cli /home/coder/.codebox/cli
COPY ./.nvmrc /home/coder/.codebox/cli/
COPY ./package.json /home/coder/.codebox/cli/
COPY ./pnpm-lock.yaml /home/coder/.codebox/cli/
RUN sudo chown -R coder:coder /home/coder/.codebox/cli
RUN echo "export CODEBOX_CLI_PATH=/home/coder/.codebox/cli" >> /home/coder/.zshrc
RUN /home/coder/.codebox/cli/install.sh
RUN sudo ln -s /home/coder/.codebox/cli/bin.sh /usr/bin/codeboxcli

EXPOSE 22
EXPOSE 80
