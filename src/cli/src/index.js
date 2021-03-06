/* eslint-disable no-console */
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const YAML = require('yaml');
const consts = require('./consts');
const fns = require('./fns');

yargs(hideBin(process.argv))
  .command(
    'get-config',
    'Retrieves the codebox setup config',
    () => {},
    async () => {
      const config = await fns.getConfig();
      console.log(config);
    },
  )
  .command(
    'get-setting <setting>',
    'Retrieves the value of a config setting',
    (yarg) =>
      yarg.option('string-list', {
        alias: 's',
        type: 'boolean',
        description: 'Transforms a setting array into a multiline string',
        default: false,
      }),
    async (argv) => {
      let setting = await fns.getSetting(argv.setting);
      if (Array.isArray(setting) && argv['string-list']) {
        setting = setting.join('\n');
      }
      console.log(typeof setting === 'undefined' ? '' : setting);
    },
  )
  .command(
    'get-code-server-config',
    'Retrieves the code-server setup config',
    (yarg) =>
      yarg.option('yaml', {
        alias: 'y',
        type: 'boolean',
        description: 'Encodes the config as YAML',
        default: false,
      }),
    async (argv) => {
      let config = await fns.getCodeServerConfig();
      if (argv.yaml) {
        config = YAML.stringify(config).trim();
      }

      console.log(config);
    },
  )
  .command(
    'get-pwa-manifest',
    'Retrieves the custom manifest for using the app as a PWA',
    () => {},
    async () => {
      const config = await fns.getPWAManifest();
      const indent = 2;
      console.log(JSON.stringify(config, null, indent));
    },
  )
  .command(
    'has [resource]',
    'Checks if a resource is present',
    (yarg) =>
      yarg.positional('resource', {
        describe: `Resource type: ${fns.humanList(
          Object.keys(consts.BOX_SETUP_SUBPATHS),
          'or',
        )}`,
        default: null,
      }),
    async (argv) => {
      if (!argv.resource) {
        throw new Error('Please specify a resource');
      }

      const exists = await fns.subpathExists(argv.resource);
      console.log(exists);
    },
  )
  .command(
    'get-path [resource]',
    'Returns the absolute path for a resource',
    (yarg) =>
      yarg.positional('resource', {
        describe: `Resource type: ${fns.humanList(
          Object.keys(consts.BOX_SETUP_SUBPATHS),
          'or',
        )}`,
        default: null,
      }),
    async (argv) => {
      if (!argv.resource) {
        throw new Error('Please specify a resource');
      }

      console.log(fns.getPath(argv.resource));
    },
  )
  .parse();
