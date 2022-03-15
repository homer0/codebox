#!/bin/zsh

. ~/.zshrc

ARGS_BLOCK="PROXY_DOMAIN_ARG=\"\"\nif [ -n \"\${CODESERVER_PROXY_DOMAIN}\" ]; then\n  PROXY_DOMAIN_ARG=\"--proxy-domain=\${CODESERVER_PROXY_DOMAIN} \"\nfi"
SEARCH_FOR="exec dumb-init \/usr\/bin\/code-server \"\$@\""

REPLACE_WITH="$ARGS_BLOCK\nexec dumb-init \/usr\/bin\/code-server --bind-addr 0\.0\.0\.0:8080 \"\${PROXY_DOMAIN_ARG}\" \/home\/coder\/code\/"

sed -i "s/$SEARCH_FOR/$REPLACE_WITH/" /usr/bin/entrypoint.sh
