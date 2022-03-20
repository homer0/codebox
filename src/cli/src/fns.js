const path = require('path');
const fs = require('fs-extra');
const ObjectUtils = require('wootils/shared/objectUtils');
const yaml = require('yaml');
const consts = require('./consts');

exports.getPath = (subpath = null) => {
  let result = consts.BOX_SETUP_PATH;
  if (subpath) {
    result = path.join(result, consts.BOX_SETUP_SUBPATHS[subpath]);
  }

  return result;
};

exports.subpathExists = (subpath) => fs.pathExists(exports.getPath(subpath));

exports.getConfig = async () => {
  let config;
  const configExists = await exports.subpathExists('config');
  if (configExists) {
    const configFile = await fs.readFile(exports.getPath('config'), 'utf8');
    config = yaml.parse(configFile);
  } else {
    config = {};
  }

  return ObjectUtils.merge(consts.DEFAULT_CODEBOX_CONFIG, config);
};

exports.getSetting = async (setting) => {
  const config = await exports.getConfig();
  return ObjectUtils.get(config, setting);
};

exports.getCodeServerConfig = async () => {
  const config = await exports.getConfig();
  const codeServerConfig = ObjectUtils.merge(
    consts.DEFAULT_CODESERVER_CONFIG,
    config['code-server'],
  );
  if (!codeServerConfig.password && !codeServerConfig['hashed-password']) {
    codeServerConfig.password = exports.getRandomString();
  }
  const { ssl } = codeServerConfig;
  delete codeServerConfig.ssl;
  delete codeServerConfig['proxy-domain'];
  if (ssl) {
    codeServerConfig.cert = true;
  }

  return codeServerConfig;
};

exports.humanList = (array, lastSeparator = 'and') => {
  const lastItem = array.pop();
  const result = array.join(', ');
  return result + (array.length > 0 ? `, ${lastSeparator} ` : '') + lastItem;
};

const DEFAULT_RANDOM_STR_LENGTH = 10;
exports.getRandomString = (length = DEFAULT_RANDOM_STR_LENGTH) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  while (result.length < length) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }

  return result;
};
