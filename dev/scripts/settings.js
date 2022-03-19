#!/usr/bin/env node

const path = require('path');
const YAML = require('yaml');
const ObjectUtils = require('wootils/shared/objectUtils');
const fs = require('fs-extra');

(async () => {
  const setting = process.argv.slice().pop();
  if (!setting) {
    throw new Error('No setting was specified');
  }
  const settingsPath = path.join(process.cwd(), 'dev', 'dev.yaml');
  const settings = await fs.readFile(settingsPath, 'utf8');
  const parsedSettings = YAML.parse(settings);
  const settingValue = ObjectUtils.get(parsedSettings, setting);
  if (typeof settingValue === 'undefined') {
    throw new Error(`No setting found for ${setting}`);
  }

  // eslint-disable-next-line no-console
  console.log(settingValue);
})();
