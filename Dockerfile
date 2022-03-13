FROM codercom/code-server

ENV GIT_CONFIG_USERNAME coder
ENV GIT_CONFIG_EMAIL coder@example.com

# Install dependencies

## SSH and nginx
RUN sudo apt update && sudo apt install openssh-server nginx -y

## oh-my-zsh
RUN sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

## nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
COPY ./src/nvm/.nvmrc /home/coder/.nvmrc
COPY ./src/nvm/nvm-config.sh /home/coder/.oh-my-zsh/nvm-config.sh
RUN echo "\n# NVM configuration\n\nsource ~/.oh-my-zsh/nvm-config.sh\n" >> .zshrc

# Replace oh-my-zsh theme
COPY ./src/oh-my-zsh/robbyrussell-ssh.zsh-theme /home/coder/.oh-my-zsh/themes/
RUN sed -i "s/ZSH_THEME=\"robbyrussell\"/if [[ -n \$SSH_CONNECTION ]]; then\n  ZSH_THEME=\"robbyrussell-ssh\"\nelse\n  ZSH_THEME=\"robbyrussell\"\nfi/" /home/coder/.zshrc

# Add aliases
COPY ./src/oh-my-zsh/user-configuration.sh /home/coder/.oh-my-zsh/user-configuration.sh
RUN sed -i "s/# User configuration/# User configuration\n\nsource \/home\/coder\/.oh-my-zsh\/user-configuration.sh/" /home/coder/.zshrc

# Configure GIT
COPY ./src/git/.gitconfig /home/coder/.gitconfig
RUN sed -i "s/{{GIT_CONFIG_USERNAME}}/$GIT_CONFIG_USERNAME/" /home/coder/.gitconfig
RUN sed -i "s/{{GIT_CONFIG_EMAIL}}/$GIT_CONFIG_EMAIL/" /home/coder/.gitconfig
COPY ./src/git/.gitignore_global /home/coder/.gitignore_global

# Fix locales

RUN sudo echo "LANG=en_US.utf-8\nLC_ALL=en_US.utf-8" >> /etc/environment

# Replace shell
RUN sudo chsh -s $(which zsh)
RUN sudo usermod -s $(which zsh) coder

## Setup SSH
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

EXPOSE 22
EXPOSE 80
EXPOSE 443

