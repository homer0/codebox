import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { getSetting } from './fns.js';

const run = promisify(execFile);
const MARKETPLACE = 'https://marketplace.visualstudio.com/_apis/public/gallery';
const LATEST_VERSION_FLAGS = 513; // Include versions and return only the latest version.
const EXTENSION_ID = /^([a-z\d][a-z\d-]*)\.([a-z\d][a-z\d.-]*)$/i;

/** Look up the latest version without transferring the VSIX. */
const getLatestVersion = async (id) => {
  const { stdout } = await run('curl', [
    '--fail',
    '--silent',
    '--show-error',
    '--compressed',
    '--max-time',
    '30',
    '--header',
    'Accept: application/json;api-version=7.2-preview.1',
    '--header',
    'Content-Type: application/json',
    '--data',
    JSON.stringify({
      filters: [{ criteria: [{ filterType: 7, value: id }] }],
      flags: LATEST_VERSION_FLAGS,
    }),
    `${MARKETPLACE}/extensionquery`,
  ]);
  const version =
    JSON.parse(stdout).results?.[0]?.extensions?.[0]?.versions?.[0]?.version;
  if (typeof version !== 'string' || !version) {
    throw new Error('Marketplace did not return a latest version');
  }
  return version;
};

/** Download and inspect a single VSIX before handing it to the editor installer. */
const installExtension = async (id, { directory, installed }) => {
  const match = typeof id === 'string' && EXTENSION_ID.exec(id);
  if (!match) throw new Error('Expected a publisher.name extension ID');

  const installedVersion = installed.get(id.toLowerCase());
  if (installedVersion && installedVersion === (await getLatestVersion(id))) {
    return;
  }

  const [, publisher, name] = match;
  const archive = join(directory, 'extension.vsix');
  await run('curl', [
    '--fail',
    '--silent',
    '--show-error',
    '--location',
    '--compressed',
    '--proto',
    '=https',
    '--proto-redir',
    '=https',
    '--max-time',
    '120',
    '--output',
    archive,
    `${MARKETPLACE}/publishers/${publisher}/vsextensions/${name}/latest/vspackage`,
  ]);
  await run('unzip', ['-tq', archive], { timeout: 30_000 });
  const { stdout } = await run('unzip', ['-p', archive, 'extension/package.json']);
  const manifest = JSON.parse(stdout);
  if (`${manifest.publisher}.${manifest.name}`.toLowerCase() !== id.toLowerCase()) {
    throw new Error('VSIX manifest does not match the requested extension');
  }

  const result = await run('code-server', ['--install-extension', archive]);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
};

/** Install opted-in Marketplace extensions without blocking startup on package failures. */
export const installMarketplaceExtensions = async () => {
  const extensions = await getSetting('vscode.msMarketplaceExtensions');
  if (typeof extensions === 'undefined') return;
  if (!Array.isArray(extensions))
    throw new Error('vscode.msMarketplaceExtensions must be a list');
  if (extensions.length === 0) return;

  const { stdout } = await run('code-server', ['--list-extensions', '--show-versions']);
  const installed = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    const [id, version] = line.trim().split('@');
    if (EXTENSION_ID.test(id) && version) installed.set(id.toLowerCase(), version);
  }

  const directory = await mkdtemp(join(tmpdir(), 'codebox-marketplace-'));
  try {
    for (const [index, id] of extensions.entries()) {
      try {
        await installExtension(id, { directory, installed });
      } catch (error) {
        const label =
          typeof id === 'string' && EXTENSION_ID.test(id) ? id : `entry ${index + 1}`;
        process.stderr.write(`Marketplace extension ${label}: ${error.message}\n`);
      }
    }
  } finally {
    await rm(directory, { recursive: true });
  }
};
