FROM codercom/code-server

ARG GIT_CONFIG_USERNAME=coder
ARG GIT_CONFIG_EMAIL=coder@example.com
ARG NODE_DEFAULT_VERSION=16
ARG CODEBOX_NAME=codebox

ENV GIT_CONFIG_USERNAME=${GIT_CONFIG_USERNAME}
ENV GIT_CONFIG_EMAIL=${GIT_CONFIG_EMAIL}
ENV NODE_DEFAULT_VERSION=${NODE_DEFAULT_VERSION}
ENV CODEBOX_NAME=${CODEBOX_NAME}

# Install dependencies

## apt packages
RUN sudo apt update && sudo apt install openssh-server nginx locales-all -y

## oh-my-zsh
RUN sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Replace oh-my-zsh theme
COPY ./src/oh-my-zsh/robbyrussell-ssh.zsh-theme /home/coder/.oh-my-zsh/themes/
RUN sed -i "s/ZSH_THEME=\"robbyrussell\"/if [[ -n \$SSH_CONNECTION ]]; then\n  ZSH_THEME=\"robbyrussell-ssh\"\nelse\n  ZSH_THEME=\"robbyrussell\"\nfi/" /home/coder/.zshrc
RUN sed -i "s/{{CODEBOX_NAME}}/$CODEBOX_NAME/" /home/coder/.oh-my-zsh/themes/robbyrussell-ssh.zsh-theme

# Add aliases
COPY ./src/oh-my-zsh/user-configuration.sh /home/coder/.oh-my-zsh/user-configuration.sh
RUN sed -i "s/# User configuration/# User configuration\n\nsource \/home\/coder\/.oh-my-zsh\/user-configuration.sh/" /home/coder/.zshrc

## nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
RUN chown -R coder:coder /home/coder/.nvm
COPY ./src/nvm/nvm-config.sh /home/coder/.oh-my-zsh/nvm-config.sh
RUN echo "\n# NVM configuration\n\nsource ~/.oh-my-zsh/nvm-config.sh\n" >> .zshrc
COPY ./src/nvm/nvm-setup-version.sh /home/coder/.nvm-setup-version.sh
RUN sudo chmod +x /home/coder/.nvm-setup-version.sh
RUN sudo chown coder:coder /home/coder/.nvm-setup-version.sh
RUN /home/coder/.nvm-setup-version.sh
RUN rm /home/coder/.nvm-setup-version.sh

# Configure GIT
COPY ./src/git/.gitconfig /home/coder/.gitconfig
RUN sed -i "s/{{GIT_CONFIG_USERNAME}}/$GIT_CONFIG_USERNAME/" /home/coder/.gitconfig
RUN sed -i "s/{{GIT_CONFIG_EMAIL}}/$GIT_CONFIG_EMAIL/" /home/coder/.gitconfig
COPY ./src/git/.gitignore_global /home/coder/.gitignore_global

# Fix locales
RUN locale-gen en_US.UTF-8
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8
RUN echo "# Locales\n\nexport LC_ALL=$LC_ALL\nexport LANGUAGE=$LANGUAGE\nexport LANG=$LANG\n" >> /home/coder/.zshrc

# Replace shell
RUN sudo chsh -s $(which zsh)
RUN sudo usermod -s $(which zsh) coder

# Setup SSH
RUN mkdir -p /home/coder/.ssh
COPY ./src/ssh/id_rsa /home/coder/.ssh/id_rsa
COPY ./src/ssh/id_rsa.pub /home/coder/.ssh/id_rsa.pub
COPY ./src/ssh/id_rsa.pub /home/coder/.ssh/authorized_keys
RUN sudo chown -R coder:coder /home/coder/.ssh
RUN sudo chmod -R 700 /home/coder/.ssh
RUN sudo sed -i "s/#PasswordAuthentication yes/PasswordAuthentication no/" /etc/ssh/sshd_config
RUN sudo sed -i "s/UsePAM yes/UsePAM no/" /etc/ssh/sshd_config
RUN sudo service ssh restart
RUN sudo sed -i 's/exec /sudo service ssh restart\nexec /' /usr/bin/entrypoint.sh

# Setup nginx
COPY ./src/nginx/default-site /etc/nginx/sites-available/default
RUN sudo sed -i 's/exec /sudo service nginx restart\nexec /' /usr/bin/entrypoint.sh

# Setup code-server
COPY ./src/code-server /home/coder/code-server-setup
RUN sudo chown -R coder:coder /home/coder/code-server-setup

## Move profile directory
RUN mkdir -p /home/coder/.local/share/code-server
RUN sudo chown -R coder:coder /home/coder/.local/share/code-server
RUN mv /home/coder/code-server-setup/profile /home/coder/.local/share/code-server/User

## Install extensions
RUN mkdir -p /home/coder/.local/share/code-server/extensions
RUN /home/coder/code-server-setup/install-remote-extensions.sh
RUN /home/coder/code-server-setup/install-local-extensions.sh

EXPOSE 22
EXPOSE 80
