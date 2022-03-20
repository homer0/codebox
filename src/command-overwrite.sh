#!/bin/zsh

# This awful block of code is needed in order to add support for custom domains
# in code-server. This is top priority in the list of things to improve.

. ~/.zshrc

# This checks if a custom domain was specified, and in case it was, it creates
# a PROXY_DOMAIN_ARG var that will be later added to the execution command.
ARGS_BLOCK="PROXY_DOMAIN=\$(codeboxcli get-setting code-server.proxy-domain)\nPROXY_DOMAIN_ARG=\"\"\nif [ -n \"\${PROXY_DOMAIN}\" ]; then\n  PROXY_DOMAIN_ARG=\"--proxy-domain=\${PROXY_DOMAIN} \"\nfi"

# This is the line of execution that will be removed from the original file.
SEARCH_FOR="exec dumb-init \/usr\/bin\/code-server \"\$@\""

# This is the new execution line, with the block that detects the custom domain
# and the line that uses the arg.
REPLACE_WITH="$ARGS_BLOCK\nexec dumb-init \/usr\/bin\/code-server --bind-addr 0\.0\.0\.0:8080 \"\${PROXY_DOMAIN_ARG}\" \/home\/coder\/code\/"

sed -i "s/$SEARCH_FOR/$REPLACE_WITH/" /usr/bin/entrypoint.sh
