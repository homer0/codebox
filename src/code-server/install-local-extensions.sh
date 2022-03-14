#!/bin/zsh

. ~/.zshrc

DIRPATH=${0:a:h};
EXTENSIONS_PATH="$DIRPATH/extensions"
EXTENSIONS_FILES=($(ls $EXTENSIONS_PATH))

for item in ${EXTENSIONS_FILES[*]}
do
  code-server --install-extension "$EXTENSIONS_PATH/$item"
done
