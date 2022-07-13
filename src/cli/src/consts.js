const path = require('path');

/**
 * The default values for the box configuration. All of these values can be
 * overridden by a `config.yaml` in the setup directory.
 */
exports.DEFAULT_CODEBOX_CONFIG = {
  name: 'codebox',
  icon: 'dark',
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
/**
 * The default values for the code-server configuration. This configuration
 * is generated based on the codebox configuration, so this format is never
 * exposed to the setup.
 */
exports.DEFAULT_CODESERVER_CONFIG = {
  'bind-addr': '127.0.0.1:8080',
  auth: 'password',
  cert: false,
};
/**
 * The path where the setup directory is mounted in the container.
 */
exports.BOX_SETUP_PATH = path.join('/', 'home', 'coder', '.codebox', 'setup');
/**
 * A dictionary of the known (possible) paths inside the the setup directory.
 */
exports.BOX_SETUP_SUBPATHS = {
  config: 'config.yaml',
  'ssh-keys': 'ssh-keys',
  'vscode.extensions': 'vscode/extensions',
  'vscode.settings': 'vscode/settings.json',
  'vscode.keybindings': 'vscode/keybindings.json',
};
