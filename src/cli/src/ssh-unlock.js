import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getConfig } from './fns.js';
import {
  getAgentEnvironment,
  getAgentFingerprints,
  SSH_AGENT_DIRECTORY,
  SSH_AGENT_SOCKET,
} from './ssh-agent.js';
import { getHostOptions, getSshState } from './ssh.js';

const runFile = promisify(execFile);
const KEY_TOOL_TIMEOUT = 5000;
const PRIVATE_FILE_MODE = 0o600;
const INVALID_KEY_STATUS = 255;
const HOME_PREFIX_LENGTH = 2;

/**
 * Resolve only a single literal SSH path; never evaluate client configuration to discover
 * keys.
 */
const resolveIdentity = (value, home) => {
  let filename = value.trim();
  if (filename.startsWith('"') && filename.endsWith('"')) {
    filename = filename.slice(1, -1);
  } else if (/\s/u.test(filename)) {
    throw new Error('quote paths containing spaces as a single IdentityFile value');
  }
  if (filename === 'none') return undefined;
  // oxlint-disable-next-line no-control-regex -- reject path and directive injection
  if (/[\x00-\x1f\x7f%$\\"'`#]/u.test(filename)) {
    throw new Error(
      'use a literal absolute or ~/ IdentityFile path; tokens, variables and escape syntax are unsupported by unlock',
    );
  }
  if (filename.startsWith('~/'))
    return path.join(home, filename.slice(HOME_PREFIX_LENGTH));
  if (path.isAbsolute(filename)) return filename;
  throw new Error(
    'use an absolute or ~/ IdentityFile path; relative paths and ~other-user expansion are unsupported by unlock',
  );
};

/**
 * Collect effective configured identities, retaining per-host discovery failures for
 * partial progress.
 */
export const getUnlockIdentities = async (options) => {
  const { ssh, home = os.homedir(), socket = SSH_AGENT_SOCKET } = options;
  const identities = new Map();
  const errors = [];
  const hosts = ssh?.client?.hosts;
  if (typeof hosts === 'undefined') return { identities: [], errors };
  if (!hosts || typeof hosts !== 'object' || Array.isArray(hosts))
    throw new Error('ssh.client.hosts must be a mapping');
  const collectIdentity = async (alias, host) => {
    try {
      const directives = getHostOptions(host, {
        alias,
        runtimeKeyDirectory: '~/.ssh/codebox-keys',
      });
      let identity;
      for (const directive of directives) {
        const name = directive.name.toLowerCase();
        if (
          name === 'identityagent' &&
          !['SSH_AUTH_SOCK', socket].includes(directive.value)
        ) {
          throw new Error(
            'raw.IdentityAgent selects another agent; remove the override or use SSH_AUTH_SOCK to unlock through the shared agent',
          );
        }
        if (name === 'identityfile') identity = directive.value;
      }
      if (typeof identity === 'undefined') return;
      const filename = resolveIdentity(identity, home);
      if (typeof filename === 'undefined') return;
      const resolved = await realpath(filename);
      if (!(await stat(resolved)).isFile())
        throw new Error('IdentityFile must reference a regular file');
      const existing = identities.get(resolved);
      if (existing) {
        if (!existing.identityFiles.includes(filename))
          existing.identityFiles.push(filename);
      } else {
        identities.set(resolved, {
          filename: resolved,
          alias,
          identityFiles: [filename],
        });
      }
    } catch (error) {
      const message = error.code
        ? 'cannot read the effective IdentityFile; check its runtime path and permissions'
        : error.message;
      errors.push(`Host ${alias}: ${message}`);
    }
  };
  for (const [alias, host] of Object.entries(hosts)) await collectIdentity(alias, host);
  return { identities: [...identities.values()], errors };
};

/** Fingerprint only the supplied bytes, never a neighboring inferred .pub file. */
const fingerprintKey = async (contents, runtimeDirectory) => {
  const temporary = await mkdtemp(path.join(runtimeDirectory, '.fingerprint-'));
  try {
    const filename = path.join(temporary, 'key');
    await writeFile(filename, contents, { mode: PRIVATE_FILE_MODE });
    try {
      const { stdout } = await runFile(
        '/usr/bin/ssh-keygen',
        ['-l', '-E', 'sha256', '-f', filename],
        {
          timeout: KEY_TOOL_TIMEOUT,
        },
      );
      return stdout.trim().split(/\s/u)[1];
    } catch (error) {
      // Encrypted legacy PEM/PKCS#8 cannot expose a public fingerprint before decryption.
      if (error.code === INVALID_KEY_STATUS || error.code === 1) return undefined;
      throw new Error('Unable to inspect an SSH identity with ssh-keygen');
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
};

/**
 * Provide the public companion OpenSSH needs to select encrypted legacy identities from
 * an agent.
 */
const ensureLegacyPublicKey = async (filename, options) => {
  const { socket, fingerprint } = options;
  if (!fingerprint) {
    throw new Error(
      'cannot uniquely identify this externally loaded legacy key; restart the container and unlock again, or use OpenSSH private-key format',
    );
  }
  const { stdout } = await runFile('/usr/bin/ssh-add', ['-L'], {
    env: getAgentEnvironment(socket),
    timeout: KEY_TOOL_TIMEOUT,
  });
  const publicKey = stdout
    .trim()
    .split('\n')
    .find((line) => {
      const encoded = line.split(/\s/u)[1];
      if (!encoded) return false;
      const digest = createHash('sha256')
        .update(Buffer.from(encoded, 'base64'))
        .digest('base64')
        .replace(/=+$/u, '');
      return `SHA256:${digest}` === fingerprint;
    });
  if (!publicKey)
    throw new Error(
      'matching public identity is no longer available in the shared agent',
    );
  const publicPath = `${filename}.pub`;
  try {
    await writeFile(publicPath, `${publicKey}\n`, {
      flag: 'wx',
      mode: PRIVATE_FILE_MODE,
    });
  } catch (error) {
    if (error.code !== 'EEXIST')
      throw new Error(
        'cannot write the public companion required for encrypted legacy IdentityFile selection; use a writable installed runtime path or OpenSSH private-key format',
      );
    const entry = await lstat(publicPath);
    const existing = entry.isFile() ? await readFile(publicPath, 'utf8') : '';
    const keyFields = 2;
    if (
      existing.trim().split(/\s/u).slice(0, keyFields).join(' ') !==
      publicKey.split(/\s/u).slice(0, keyFields).join(' ')
    ) {
      throw new Error(
        'runtime .pub companion conflicts with the unlocked key; remove or correct that file explicitly, or use OpenSSH private-key format',
      );
    }
  }
};

/** Read non-secret loaded-key hints; malformed hints must not suppress an unlock attempt. */
const readCache = async (filename, report) => {
  try {
    const cache = JSON.parse(await readFile(filename, 'utf8'));
    if (!cache || typeof cache !== 'object' || Array.isArray(cache))
      throw new Error('invalid cache');
    for (const [digest, fingerprints] of Object.entries(cache)) {
      if (
        !/^[a-f0-9]{64}$/u.test(digest) ||
        !Array.isArray(fingerprints) ||
        !fingerprints.length ||
        !fingerprints.every(
          (fingerprint) =>
            typeof fingerprint === 'string' &&
            /^SHA256:[A-Za-z0-9+/]+$/u.test(fingerprint),
        )
      ) {
        throw new Error('invalid cache');
      }
    }
    return cache;
  } catch (error) {
    if (error.code !== 'ENOENT')
      report(
        'Unable to read SSH unlock fingerprint hints; identities will be checked again',
      );
    return {};
  }
};

/** Let OpenSSH own terminal input; Node never reads a passphrase. */
const addIdentity = (filename, options) =>
  new Promise((resolve, reject) => {
    const { socket, terminal } = options;
    const child = spawn('/usr/bin/ssh-add', ['-q', '-k', filename], {
      env: getAgentEnvironment(socket),
      stdio: [terminal.fd, terminal.fd, terminal.fd],
    });
    child.once('error', () => reject(new Error('Unable to execute ssh-add')));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

/**
 * Unlock distinct effective identities, preserving successes when other keys fail. Cache
 * entries contain only file digests and public agent fingerprints, never private data.
 */
export const unlockSshIdentities = async (options) => {
  const {
    identities,
    errors = [],
    socket = SSH_AGENT_SOCKET,
    runtimeDirectory = SSH_AGENT_DIRECTORY,
    report = (message) => process.stderr.write(`${message}\n`),
  } = options;
  if (typeof (await getAgentFingerprints(socket)) === 'undefined') {
    throw new Error(
      'Shared SSH agent is unavailable; restart codebox setup before unlocking keys',
    );
  }
  const cacheFile = path.join(runtimeDirectory, 'unlocked-fingerprints.json');
  const cache = await readCache(cacheFile, report);
  let loaded = 0;
  let alreadyLoaded = 0;
  let failed = errors.length;
  let cancelled = false;
  let terminal;
  const onInterrupt = () => {
    cancelled = true;
  };
  process.on('SIGINT', onInterrupt);
  for (const error of errors) report(error);
  const unlockIdentity = async (identity) => {
    if (cancelled) {
      failed += 1;
      report(`Not attempted after cancellation: ${identity.filename}`);
      return;
    }
    try {
      const contents = await readFile(identity.filename);
      const digest = createHash('sha256').update(contents).digest('hex');
      const fingerprint = await fingerprintKey(contents, runtimeDirectory);
      const before = await getAgentFingerprints(socket);
      if (typeof before === 'undefined')
        throw new Error('shared SSH agent became unavailable');
      const hints = fingerprint ? [fingerprint] : cache[digest];
      if (hints && hints.every((item) => before.includes(item))) {
        alreadyLoaded += 1;
        report(`Already loaded: ${identity.filename}`);
        if (!fingerprint) {
          const identityFiles = identity.identityFiles || [identity.filename];
          for (const filename of identityFiles) {
            await ensureLegacyPublicKey(filename, {
              socket,
              fingerprint: hints.length === 1 ? hints[0] : undefined,
            });
          }
        }
        return;
      }
      if (!terminal) {
        try {
          terminal = await open('/dev/tty', 'r+');
        } catch {
          throw new Error(
            'no controlling terminal; run codeboxcli unlock-ssh-keys in an interactive terminal',
          );
        }
      }
      report(`Unlocking: ${identity.filename}`);
      const result = await addIdentity(identity.filename, { socket, terminal });
      if (result.signal === 'SIGINT') cancelled = true;
      if (result.code !== 0 || cancelled)
        throw new Error(
          'unlock failed or was cancelled; earlier successes remain loaded',
        );
      const after = await getAgentFingerprints(socket);
      if (!after || !after.length)
        throw new Error(
          'ssh-add completed but the agent identity could not be confirmed',
        );
      const added = after.filter((item) => !before.includes(item));
      loaded += 1;
      report(`Loaded: ${identity.filename}`);
      let identified = fingerprint;
      if (!identified && added.length === 1) [identified] = added;
      if (!identified && after.length === 1) [identified] = after;
      if (!fingerprint) {
        const identityFiles = identity.identityFiles || [identity.filename];
        for (const filename of identityFiles) {
          await ensureLegacyPublicKey(filename, { socket, fingerprint: identified });
        }
      }
      if (identified) cache[digest] = [identified];
    } catch (error) {
      failed += 1;
      report(
        `Failed ${identity.filename}: ${error.code ? 'cannot read identity or update its runtime metadata' : error.message}`,
      );
    }
  };
  try {
    for (const identity of identities) await unlockIdentity(identity);
    const temporary = path.join(runtimeDirectory, 'unlocked-fingerprints.tmp');
    await writeFile(temporary, JSON.stringify(cache), { mode: PRIVATE_FILE_MODE });
    await chmod(temporary, PRIVATE_FILE_MODE);
    await rename(temporary, cacheFile);
    report(
      `SSH keys: ${loaded} loaded, ${alreadyLoaded} already loaded, ${failed} failed`,
    );
    return { loaded, alreadyLoaded, failed };
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    if (terminal) await terminal.close();
  }
};

/** Unlock only the installed configuration, requiring setup again after YAML changes. */
export const unlockConfiguredSshKeys = async () => {
  const user = os.userInfo();
  if (user.username !== 'coder') throw new Error('SSH unlock must run as coder');
  const desired = await getSshState();
  const installed = await readFile(path.join(user.homedir, '.ssh', 'config'), 'utf8');
  if (installed !== desired.clientConfig)
    throw new Error(
      'SSH client configuration changed; restart codebox setup before unlocking',
    );
  const config = await getConfig();
  const discovery = await getUnlockIdentities({ ssh: config.ssh, home: user.homedir });
  const result = await unlockSshIdentities(discovery);
  if (result.failed)
    throw new Error(
      'Some SSH identities were not unlocked; successful identities remain loaded',
    );
};
