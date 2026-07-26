import path from 'path';
import fs from 'fs-extra';
import { merge, get } from '@homer0/object-utils';
import yaml from 'yaml';
import * as consts from './consts';
/**
 * Gets the absolute path for known path in the box setup directory.
 *
 * @param {?string} subpath  The name of the path, from the ones defined in the
 *                           `BOX_SETUP_SUBPATHS` constant. If no path is
 *                           specified, it will return the path to the setup
 *                           directory.
 * @returns {string}
 */
export const getPath = (subpath = null) => {
  let result = consts.BOX_SETUP_PATH;
  if (subpath) {
    result = path.join(result, consts.BOX_SETUP_SUBPATHS[subpath]);
  }

  return result;
};
/**
 * Checks if a known path, inside the setup directory, exists.
 *
 * @param {?string} subpath  The name of the path, from the ones defined in the
 *                           `BOX_SETUP_SUBPATHS` constant.
 * @returns {Promise<boolean>}
 */
export const subpathExists = (subpath) => fs.pathExists(getPath(subpath));
/**
 * Gets the box configuration, using the `DEFAULT_BOX_CONFIG` constant as a
 * base.
 *
 * @returns {Promise<object>}
 */
export const getConfig = async () => {
  let config;
  const configExists = await subpathExists('config');
  if (configExists) {
    const configFile = await fs.readFile(getPath('config'), 'utf8');
    config = yaml.parse(configFile);
  } else {
    config = {};
  }

  return merge(consts.DEFAULT_CODEBOX_CONFIG, config);
};
/**
 * Gets the value of a single setting fromthe box configuration.
 *
 * @param {string} setting  The "path" to the setting. For example
 *                          `node.default-version`.
 * @returns {Promise<*>}
 */
export const getSetting = async (setting) => {
  const config = await getConfig();
  return get({ target: config, path: setting });
};

const DEFAULT_RANDOM_STR_LENGTH = 10;
/**
 * Generates a random string of the specified length.
 *
 * @param {number} [length=10] The length the string.
 * @returns {string}
 */
export const getRandomString = (length = DEFAULT_RANDOM_STR_LENGTH) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  while (result.length < length) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }

  return result;
};

/**
 * Calculates and returns the code-server configuration based on the box
 * configuration.
 *
 * @returns {Promise<object>}
 */
export const getCodeServerConfig = async () => {
  const config = await getConfig();
  const codeServerConfig = merge(consts.DEFAULT_CODESERVER_CONFIG, config['code-server']);
  if (!codeServerConfig.password && !codeServerConfig['hashed-password']) {
    codeServerConfig.password = getRandomString();
  }
  const { ssl } = codeServerConfig;
  delete codeServerConfig.ssl;
  delete codeServerConfig['proxy-domain'];
  if (ssl) {
    codeServerConfig.cert = true;
  }

  return codeServerConfig;
};
/**
 * Generates the PWA manifest for the box, based on the box configuration.
 */
export const getPWAManifest = async () => {
  const { name, icon, description } = await getConfig();
  const pwaMnifest = merge(consts.DEFAULT_PWA_MANIFEST, {
    name,
    short_name: name,
    description: description || consts.DEFAULT_PWA_MANIFEST.description,
  });
  const iconPath = `{{BASE}}/_static/src/browser/media/codebox-icons/${icon}`;
  // eslint-disable-next-line no-magic-numbers
  pwaMnifest.icons = [192, 256, 384, 512, 1024].map((size) => ({
    src: `${iconPath}/icon-${size}.png`,
    type: 'image/png',
    sizes: `${size}x${size}`,
    purpose: 'maskable',
  }));

  return pwaMnifest;
};
/**
 * Transforms an array of words into a human-readable sentence, by adding
 * a comma between each world, and a separator between the last two words.
 *
 * @example
 * humanList(['foo', 'bar', 'baz'])
 * // => 'foo, bar, and baz'
 *
 * @param {string[]} array                  The list of words.
 * @param {string}   [lastSeparator='and']  The separator to use between the last
 *                                          two words.
 * @returns {string}
 */
export const humanList = (array, lastSeparator = 'and') => {
  const lastItem = array.pop();
  const result = array.join(', ');
  return result + (array.length > 0 ? `, ${lastSeparator} ` : '') + lastItem;
};
