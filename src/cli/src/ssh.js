import { execFile } from 'node:child_process';
import { createPrivateKey } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { getConfig, getPath } from './fns.js';

const runFile = promisify(execFile);
// Bound subprocesses so malformed credentials cannot leave setup waiting for input.
const SSH_TOOL_TIMEOUT = 10000;
const SSH_STRING_LENGTH_BYTES = 4;
const OPENSSH_AUTH_TAG_BYTES = 16;
const OPENSSH_MAGIC = 'openssh-key-v1\0';

/** Reject non-mapping YAML values before inspecting their properties. */
const requireMapping = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a mapping`);
  }
};

/** Keep each generated directive on exactly one line. */
const requireScalar = (value, label) => {
  // oxlint-disable-next-line no-control-regex -- reject directive injection via control characters
  if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f\x7f]/u.test(value)) {
    throw new Error(`${label} must be a nonempty string without control characters`);
  }
  return value;
};

/**
 * Resolve exact filenames, permitting only symlinks that stay inside the source
 * directory.
 */
const resolveSource = async (filename, options) => {
  const { sourceDirectory, label } = options;
  if (typeof filename !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/u.test(filename)) {
    throw new Error(
      `${label} must be a safe filename, not a path (no suffix is inferred)`,
    );
  }
  try {
    const root = await realpath(sourceDirectory);
    const source = await realpath(path.join(root, filename));
    if (path.dirname(source) !== root || !(await stat(source)).isFile()) {
      throw new Error('not a regular file within ssh-keys');
    }
    return { filename, source, contents: await readFile(source, 'utf8') };
  } catch {
    throw new Error(
      `${label}: cannot read ${filename} as a regular file inside setup/ssh-keys/`,
    );
  }
};

/** Invoke OpenSSH only on isolated files, never allowing companion .pub inference. */
const inspectKey = async (contents, privateKey = false) => {
  const directory = await mkdtemp('/tmp/codebox-ssh-');
  try {
    const filename = path.join(directory, 'key');
    await writeFile(filename, contents, { mode: 0o600 });
    const args = privateKey ? ['-y', '-P', '', '-f', filename] : ['-l', '-f', filename];
    await runFile('ssh-keygen', args, {
      timeout: SSH_TOOL_TIMEOUT,
      // oxlint-disable-next-line node/no-process-env -- preserve tool lookup while forbidding askpass
      env: { ...process.env, SSH_ASKPASS_REQUIRE: 'never', LC_ALL: 'C' },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

/** Decode an armored container without accepting truncated or permissive base64. */
const decodeArmor = (contents, label) => {
  const match = contents
    .trim()
    .match(
      /^-----BEGIN ([A-Z0-9 ]+PRIVATE KEY)-----\r?\n([\s\S]+)\r?\n-----END \1-----$/u,
    );
  if (!match) throw new Error(`${label} must contain a private key, not public material`);
  const body = match[2].replace(
    /^Proc-Type: 4,ENCRYPTED\r?\nDEK-Info: [^\r\n]+\r?\n\r?\n/u,
    '',
  );
  const encoded = body.replace(/\s/gu, '');
  const buffer = Buffer.from(encoded, 'base64');
  if (!encoded || buffer.toString('base64') !== encoded) {
    throw new Error(`${label} has invalid private-key armor`);
  }
  return { format: match[1], buffer };
};

/** Check the outer OpenSSH container; encrypted payload integrity requires unlocking. */
const inspectOpenSshContainer = (buffer) => {
  if (buffer.subarray(0, OPENSSH_MAGIC.length).toString() !== OPENSSH_MAGIC) {
    throw new Error('invalid OpenSSH header');
  }
  let offset = OPENSSH_MAGIC.length;
  const readString = () => {
    const length = buffer.readUInt32BE(offset);
    offset += SSH_STRING_LENGTH_BYTES;
    if (length > buffer.length - offset) throw new Error('truncated OpenSSH container');
    const result = buffer.subarray(offset, offset + length);
    offset += length;
    return result;
  };
  const cipher = readString().toString();
  const kdf = readString().toString();
  const kdfOptions = readString();
  if (buffer.readUInt32BE(offset) !== 1) throw new Error('expected one private key');
  offset += SSH_STRING_LENGTH_BYTES;
  const publicKey = readString();
  const payload = readString();
  const authenticatedCipher =
    cipher.endsWith('-gcm@openssh.com') || cipher === 'chacha20-poly1305@openssh.com';
  const tagLength = authenticatedCipher ? OPENSSH_AUTH_TAG_BYTES : 0;
  if (offset + tagLength !== buffer.length || !publicKey.length || !payload.length) {
    throw new Error('invalid OpenSSH container length');
  }
  const encrypted = cipher !== 'none';
  if (encrypted) {
    const supportedCipher =
      /^(?:aes(?:128|192|256)-(?:cbc|ctr)|aes(?:128|256)-gcm@openssh\.com|chacha20-poly1305@openssh\.com|3des-cbc)$/u.test(
        cipher,
      );
    if (
      !supportedCipher ||
      kdf !== 'bcrypt' ||
      kdfOptions.length < SSH_STRING_LENGTH_BYTES
    ) {
      throw new Error('invalid or unsupported encrypted OpenSSH container');
    }
    const saltLength = kdfOptions.readUInt32BE(0);
    const roundsOffset = SSH_STRING_LENGTH_BYTES + saltLength;
    if (
      !saltLength ||
      roundsOffset + SSH_STRING_LENGTH_BYTES !== kdfOptions.length ||
      !kdfOptions.readUInt32BE(roundsOffset)
    ) {
      throw new Error('invalid OpenSSH bcrypt parameters');
    }
  }
  if (!encrypted && (kdf !== 'none' || kdfOptions.length)) {
    throw new Error('invalid unencrypted OpenSSH container');
  }
  return encrypted;
};

/** Validate private material without requesting or retaining a passphrase. */
const validatePrivateKey = async (file, label) => {
  try {
    const { format, buffer } = decodeArmor(file.contents, label);
    if (format === 'OPENSSH PRIVATE KEY') {
      const encrypted = inspectOpenSshContainer(buffer);
      await inspectKey(file.contents, !encrypted);
      return;
    }
    try {
      createPrivateKey({ key: file.contents, passphrase: '' });
    } catch (error) {
      const encrypted =
        format === 'ENCRYPTED PRIVATE KEY' ||
        /^Proc-Type: 4,ENCRYPTED$/mu.test(file.contents);
      const passphraseError = [
        'ERR_OSSL_BAD_DECRYPT',
        'ERR_MISSING_PASSPHRASE',
        'ERR_OSSL_CRYPTO_INTERRUPTED_OR_CANCELLED',
      ].includes(error.code);
      if (!encrypted || !passphraseError) throw error;
      return;
    }
    await inspectKey(file.contents, true);
  } catch {
    throw new Error(
      `${label}: ${file.filename} must contain a valid private key (encrypted keys are supported)`,
    );
  }
};

/**
 * Validate public-key lines individually so invalid siblings cannot be ignored by
 * ssh-keygen.
 */
const validateAuthorization = async (file, label) => {
  const lines = file.contents.trim().split(/\r?\n/u);
  for (const line of lines) {
    if (
      // oxlint-disable-next-line no-control-regex -- disallow control characters in key comments
      !/^(?:ssh-|ecdsa-|sk-)[^\s]+ [A-Za-z0-9+/]+={0,2}(?: [^\x00-\x1f\x7f]*)?$/u.test(
        line,
      )
    ) {
      throw new Error(
        `${label}: ${file.filename} must contain public-key lines, not private keys or authorized_keys options`,
      );
    }
    try {
      await inspectKey(`${line}\n`);
    } catch {
      throw new Error(`${label}: ${file.filename} contains an invalid public key`);
    }
  }
  return lines;
};

/** Merge raw overrides before rendering; never append additive IdentityFile duplicates. */
const getHostOptions = (host, options) => {
  const { alias, runtimeKeyDirectory } = options;
  const label = `ssh.client.hosts.${alias}`;
  requireMapping(host, label);
  const generated = new Map();
  for (const [setting, directive] of [
    ['hostname', 'HostName'],
    ['user', 'User'],
  ]) {
    if (typeof host[setting] !== 'undefined') {
      const value = requireScalar(host[setting], `${label}.${setting}`);
      if (!/^[a-zA-Z0-9_.@:-]+$/u.test(value)) {
        throw new Error(`${label}.${setting} contains unsafe SSH characters`);
      }
      generated.set(directive.toLowerCase(), { name: directive, value });
    }
  }
  if (typeof host.key !== 'undefined') {
    generated.set('identityfile', {
      name: 'IdentityFile',
      value: `"${runtimeKeyDirectory}/${host.key}"`,
    });
  }
  generated.set('identitiesonly', { name: 'IdentitiesOnly', value: 'yes' });
  if (typeof host.raw !== 'undefined') {
    requireMapping(host.raw, `${label}.raw`);
    const names = new Set();
    for (const [name, value] of Object.entries(host.raw)) {
      const normalized = name.toLowerCase();
      if (
        !/^[a-zA-Z][a-zA-Z0-9]*$/u.test(name) ||
        ['host', 'match', 'include'].includes(normalized)
      ) {
        throw new Error(
          `${label}.raw.${name}: expected an option name, not a block or include directive`,
        );
      }
      if (names.has(normalized))
        throw new Error(`${label}.raw has case-duplicate option ${name}`);
      names.add(normalized);
      generated.set(normalized, {
        name,
        value: requireScalar(value, `${label}.raw.${name}`),
      });
    }
  }
  return [...generated.values()];
};

/**
 * Validate explicit SSH configuration and render desired files without installing them.
 * Encrypted credentials receive container validation; decryption integrity is checked at
 * unlock.
 *
 * @param {object} options Configuration plus source and runtime directories.
 * @returns {Promise<object>} Rendered authorization, client config, and selected outbound
 *   sources.
 */
export const getDesiredSshState = async (options) => {
  const { ssh, sourceDirectory, runtimeKeyDirectory = '~/.ssh/codebox-keys' } = options;
  if (
    typeof ssh === 'undefined' ||
    (ssh && typeof ssh['authorized-keys'] === 'undefined')
  ) {
    throw new Error(
      'Set ssh.authorized-keys to a nonempty list of public-key filenames in setup/ssh-keys/. Legacy id_rsa.pub authorization is no longer implicit; list it explicitly to migrate. Configure outbound private keys separately under ssh.client.hosts.',
    );
  }
  requireMapping(ssh, 'ssh');
  const authorizedKeys = ssh['authorized-keys'];
  if (!Array.isArray(authorizedKeys) || !authorizedKeys.length) {
    throw new Error(
      'ssh.authorized-keys must be a nonempty list of public-key filenames in setup/ssh-keys/',
    );
  }
  if (
    typeof runtimeKeyDirectory !== 'string' ||
    !/^(?:~\/|\/)[a-zA-Z0-9_./-]+$/u.test(runtimeKeyDirectory)
  ) {
    throw new Error(
      'runtimeKeyDirectory must be a safe absolute or home-relative SSH path',
    );
  }
  const authorization = [];
  for (const [index, filename] of authorizedKeys.entries()) {
    const label = `ssh.authorized-keys[${index}]`;
    const file = await resolveSource(filename, { sourceDirectory, label });
    authorization.push(...(await validateAuthorization(file, label)));
  }
  let hosts = {};
  if (typeof ssh.client !== 'undefined') {
    requireMapping(ssh.client, 'ssh.client');
    if (typeof ssh.client.hosts !== 'undefined') {
      requireMapping(ssh.client.hosts, 'ssh.client.hosts');
      hosts = ssh.client.hosts;
    }
  }
  const privateKeys = new Map();
  const blocks = [];
  for (const [alias, host] of Object.entries(hosts)) {
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/u.test(alias)) {
      throw new Error(
        'ssh.client.hosts aliases must be literal host names without whitespace or patterns',
      );
    }
    const directives = getHostOptions(host, { alias, runtimeKeyDirectory });
    if (typeof host.key !== 'undefined') {
      const label = `ssh.client.hosts.${alias}.key`;
      const file = await resolveSource(host.key, { sourceDirectory, label });
      if (!privateKeys.has(file.filename)) {
        await validatePrivateKey(file, label);
        privateKeys.set(file.filename, { filename: file.filename, source: file.source });
      }
    }
    blocks.push(
      `Host ${alias}\n${directives.map(({ name, value }) => `  ${name} ${value}`).join('\n')}`,
    );
  }
  return {
    authorizedKeys: `${authorization.join('\n')}\n`,
    clientConfig: blocks.length ? `${blocks.join('\n\n')}\n` : '',
    privateKeys: [...privateKeys.values()],
  };
};

/** Build validated SSH files without changing runtime files or the read-only setup. */
export const getSshState = async () => {
  const config = await getConfig();
  return getDesiredSshState({ ssh: config.ssh, sourceDirectory: getPath('ssh-keys') });
};
