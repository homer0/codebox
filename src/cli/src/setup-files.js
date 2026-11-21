import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getConfig } from './fns.js';

/** Validate the entire list before any trusted setup script can make changes. */
const validateSetupFiles = async (files) => {
  if (!Array.isArray(files)) throw new Error('box.setup-files must be an array');
  for (const filename of files) {
    if (
      typeof filename !== 'string' ||
      !path.isAbsolute(filename) ||
      !filename.endsWith('.sh') ||
      /[\r\n\0]/u.test(filename)
    ) {
      throw new Error('box.setup-files entries must be absolute paths to .sh files');
    }
    try {
      const entry = await stat(filename);
      if (!entry.isFile()) throw new Error('not a regular file');
      await access(filename, constants.R_OK);
    } catch (error) {
      throw new Error(`Cannot read box.setup-files script: ${filename}`, {
        cause: error,
      });
    }
  }
};

/**
 * Run Bash directly, preserving output and argument boundaries without shell
 * interpolation.
 */
const runScript = (filename) =>
  new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', ['--', filename], { stdio: 'inherit' });
    child.once('error', (error) => {
      reject(new Error(`Unable to start setup script: ${filename}`, { cause: error }));
    });
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Setup script failed: ${filename} (${signal ? `signal ${signal}` : `exit ${code}`})`,
          ),
        );
      }
    });
  });

/**
 * Run validated scripts sequentially on every invocation; completed effects are not
 * rolled back.
 */
export const runSetupFiles = async (files) => {
  await validateSetupFiles(files);
  for (const filename of files) {
    // oxlint-disable-next-line no-console -- intentional startup progress output
    console.log(`== running setup script: ${filename}`);
    await runScript(filename);
  }
};

/** Run configured scripts as coder, with privilege escalation left to each script. */
export const runConfiguredSetupFiles = async () => {
  if (os.userInfo().username !== 'coder')
    throw new Error('Setup scripts must run as coder, not through sudo');
  const config = await getConfig();
  await runSetupFiles(config.box?.['setup-files']);
};
