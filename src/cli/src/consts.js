const path = require('path');

exports.EMPTY_FN = () => {};

exports.JSON_INDENT = 2;

exports.DEFAULT_CODEBOX_CONFIG = {
  name: 'codebox',
  node: {
    'default-version': 16,
  },
  'code-server': {},
  vscode: {},
  git: {
    username: 'codebox',
    email: 'codebox@homer0.dev',
  },
};

exports.DEFAULT_CODESERVER_CONFIG = {
  'bind-addr': '127.0.0.1:8080',
  auth: 'password',
  cert: false,
};

exports.BOX_SETUP_PATH = path.join('/', 'home', 'coder', '.codebox', 'setup');

exports.BOX_SETUP_SUBPATHS = {
  config: 'config.yaml',
  'ssh-keys': 'ssh-keys',
  'vscode.extensions': 'vscode/extensions',
  'vscode.settings': 'vscode/settings.json',
  'vscode.keybindings': 'vscode/keybindings.json',
};
