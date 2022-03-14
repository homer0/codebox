#!/bin/zsh

. ~/.zshrc

EXTENSIONS_IDS=(\
  # Atom Keymap
  "ms-vscode.atom-keybindings" \
  # Beautify
  "HookyQR.beautify" \
  # CodeSnap
  "adpyke.codesnap" \
  # EditorConfig for VS Code
  "EditorConfig.EditorConfig" \
  # EJS language support
  "DigitalBrainstem.javascript-ejs-support" \
  # ESLint
  "dbaeumer.vscode-eslint" \
  # file-icons
  "file-icons.file-icons" \
  # Sass
  "syler.sass-indented" \
  # Svelte for VS Code
  "svelte.svelte-vscode" \
)

for item in ${EXTENSIONS_IDS[*]}
do
  code-server --install-extension "$item"
done
