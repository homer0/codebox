#!/usr/bin/env node

import path from 'path';
import YAML from 'yaml';
import { get } from '@homer0/object-utils';
import fs from 'fs-extra';

(async () => {
  const setting = process.argv.slice().pop();
  if (!setting) {
    throw new Error('No setting was specified');
  }
  const settingsPath = path.join(process.cwd(), 'dev', 'dev.yaml');
  const settings = await fs.readFile(settingsPath, 'utf8');
  const parsedSettings = YAML.parse(settings);
  const settingValue = get({
    target: parsedSettings,
    path: setting,
  });
  if (typeof settingValue === 'undefined') {
    throw new Error(`No setting found for ${setting}`);
  }

  // eslint-disable-next-line no-console
  console.log(settingValue);
})();
