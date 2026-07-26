FROM codercom/code-server:4.130.0-debian

# Install dependencies

## apt packages
RUN sudo apt update && sudo apt install openssh-server nginx locales-all jq unzip -y

## ngrok (copied from https://dashboard.ngrok.com/get-started/setup/linux)
RUN curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
  | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null && echo "deb https://ngrok-agent.s3.amazonaws.com buster main" \
  | sudo tee /etc/apt/sources.list.d/ngrok.list && sudo apt update && sudo apt install ngrok

## oh-my-zsh
RUN sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Replace oh-my-zsh theme
COPY ./src/oh-my-zsh/robbyrussell-ssh.zsh-theme /home/coder/.oh-my-zsh/themes/
RUN sed -i "s/ZSH_THEME=\"robbyrussell\"/if [[ -n \$SSH_CONNECTION ]]; then\n  ZSH_THEME=\"robbyrussell-ssh\"\nelse\n  ZSH_THEME=\"robbyrussell\"\nfi/" /home/coder/.zshrc

# Add aliases
COPY ./src/oh-my-zsh/user-configuration.sh /home/coder/.oh-my-zsh/user-configuration.sh
RUN sed -i "s/# User configuration/# User configuration\n\nsource \/home\/coder\/.oh-my-zsh\/user-configuration.sh/" /home/coder/.zshrc

# fnm
RUN curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir /home/coder/.fnm
RUN chown -R coder:coder /home/coder/.fnm
COPY ./src/fnm/fnm-config.sh /home/coder/.oh-my-zsh/fnm-config.sh
RUN echo "\n# FNM configuration\n\nsource ~/.oh-my-zsh/fnm-config.sh\n" >> .zshrc
COPY ./src/fnm/fnm-setup-version.sh /home/coder/.fnm-setup-version.sh
RUN sudo chmod +x /home/coder/.fnm-setup-version.sh
RUN sudo chown coder:coder /home/coder/.fnm-setup-version.sh
RUN /home/coder/.fnm-setup-version.sh
RUN rm /home/coder/.fnm-setup-version.sh

# Entrypoint customization
RUN mkdir /home/coder/entrypoint.d
COPY ./src/codebox-entrypoint.sh /home/coder/entrypoint.d/codebox-entrypoint.sh
COPY ./src/patch-pwa-manifest.mjs /home/coder/entrypoint.d/patch-pwa-manifest.mjs
RUN sudo chmod +x /home/coder/entrypoint.d/codebox-entrypoint.sh
ENV ENTRYPOINTD=/home/coder/entrypoint.d

# Configure GIT
COPY ./src/git/.gitconfig /home/coder/.gitconfig
COPY ./src/git/.gitignore_global /home/coder/.gitignore_global

# Fix locales
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8
RUN echo "# Locales\n\nexport LC_ALL=$LC_ALL\nexport LANGUAGE=$LANGUAGE\nexport LANG=$LANG\n" >> /home/coder/.zshrc

# Change permissions for the PWA setup
RUN sudo chmod 0755 /usr/lib/code-server/out/node/routes/vscode.js

# Replace shell
RUN sudo chsh -s $(which zsh)
RUN sudo usermod -s $(which zsh) coder

# Setup SSH
RUN sudo sed -i "s/#PasswordAuthentication yes/PasswordAuthentication no/" /etc/ssh/sshd_config

# Setup nginx
COPY ./src/nginx/default-site /etc/nginx/sites-available/default

# Add VS Code icons
COPY ./src/vscode/icons /usr/lib/code-server/src/browser/media/codebox-icons

# Setup CLI
RUN mkdir -p /home/coder/.codebox/cli
COPY ./src/cli /home/coder/.codebox/cli
COPY ./.node-version /home/coder/.codebox/cli/
COPY ./package.json /home/coder/.codebox/cli/
COPY ./pnpm-lock.yaml /home/coder/.codebox/cli/
RUN sudo chown -R coder:coder /home/coder/.codebox/cli
RUN echo "export CODEBOX_CLI_PATH=/home/coder/.codebox/cli" >> /home/coder/.zshrc
RUN /home/coder/.codebox/cli/install.sh
RUN sudo ln -s /home/coder/.codebox/cli/bin.sh /usr/bin/codeboxcli

EXPOSE 22
EXPOSE 80
