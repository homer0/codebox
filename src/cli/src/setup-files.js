import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getConfig } from './fns.js';

const SUDO_PREFIX = 'sudo:';

/** Validate the entire list before any trusted setup script can make changes. */
const validateSetupFiles = async (files) => {
  if (!Array.isArray(files)) throw new Error('box.setup-files must be an array');
  const scripts = [];
  for (const entry of files) {
    if (typeof entry !== 'string')
      throw new Error('box.setup-files entries must be absolute paths to .sh files');
    const runAsRoot = entry.startsWith(SUDO_PREFIX);
    const filename = runAsRoot ? entry.slice(SUDO_PREFIX.length) : entry;
    if (
      !path.isAbsolute(filename) ||
      !filename.endsWith('.sh') ||
      /[\r\n\0]/u.test(filename)
    ) {
      throw new Error('box.setup-files entries must be absolute paths to .sh files');
    }
    try {
      const file = await stat(filename);
      if (!file.isFile()) throw new Error('not a regular file');
      await access(filename, constants.R_OK);
    } catch (error) {
      throw new Error(`Cannot read box.setup-files script: ${filename}`, {
        cause: error,
      });
    }
    scripts.push({ filename, runAsRoot });
  }
  return scripts;
};

/**
 * Run Bash directly, preserving output and argument boundaries without shell
 * interpolation.
 */
const runScript = ({ filename, runAsRoot }) =>
  new Promise((resolve, reject) => {
    const command = runAsRoot ? 'sudo' : '/bin/bash';
    const args = runAsRoot ? ['--', '/bin/bash', '--', filename] : ['--', filename];
    const child = spawn(command, args, { stdio: 'inherit' });
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
  const scripts = await validateSetupFiles(files);
  for (const script of scripts) {
    // oxlint-disable-next-line no-console -- intentional startup progress output
    console.log(
      `== running setup script: ${script.runAsRoot ? SUDO_PREFIX : ''}${script.filename}`,
    );
    await runScript(script);
  }
};

/** Run setup as coder, elevating only scripts explicitly marked with the sudo: prefix. */
export const runConfiguredSetupFiles = async () => {
  if (os.userInfo().username !== 'coder')
    throw new Error('Setup scripts must run as coder, not through sudo');
  const config = await getConfig();
  await runSetupFiles(config.box?.['setup-files']);
};
