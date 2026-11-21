import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, createPrivateKey } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import YAML from 'yaml';

describe('persistent SSH host-key setup', () => {
  const FILE_MODE = 0o600;
  const DIRECTORY_MODE = 0o700;
  const PERMISSION_MASK = 0o777;
  const SCRIPT_MODE = 0o755;
  const TOOL_TIMEOUT = 30000;
  let directory;
  let mountDirectory;
  let script;
  let binaries;
  let ownerLog;
  const privatePath = (type) => path.join(mountDirectory, `ssh_host_${type}_key`);
  const digest = async (filename) =>
    createHash('sha256')
      .update(await readFile(filename))
      .digest('hex');
  const execute = (environment = {}) =>
    spawnSync('/bin/sh', [script], {
      timeout: TOOL_TIMEOUT,
      encoding: 'utf8',
      env: {
        PATH: `${binaries}:/usr/bin:/bin`,
        TEST_OWNER_LOG: ownerLog,
        ...environment,
      },
    });

  before(async () => {
    directory = await mkdtemp('/tmp/codebox-host-keys-');
    mountDirectory = path.join(directory, 'mount');
    binaries = path.join(directory, 'bin');
    ownerLog = path.join(directory, 'owners');
    script = path.join(directory, 'setup.sh');
    await mkdir(binaries);
    const original = await readFile('src/setup-ssh-host-keys.sh', 'utf8');
    await writeFile(
      script,
      original.replaceAll('/var/lib/codebox/ssh-host-keys', mountDirectory),
    );
    // Privilege and mount primitives are simulated; Docker checks verify the real boundary.
    /* oxlint-disable no-template-curly-in-string -- shell expansions run in the test subprocess */
    const commands = {
      id: 'printf "%s\\n" "${TEST_UID:-0}"',
      mountpoint: 'exit "${TEST_MOUNT_STATUS:-0}"',
      flock: 'exit "${TEST_LOCK_STATUS:-0}"',
      chown: 'printf "%s\\n" "$*" >> "$TEST_OWNER_LOG"',
      mktemp:
        'if [ "${TEST_READ_ONLY:-no}" = yes ]; then exit 1; fi; exec /usr/bin/mktemp "$@"',
    };
    /* oxlint-enable no-template-curly-in-string */
    for (const [name, contents] of Object.entries(commands)) {
      const filename = path.join(binaries, name);
      await writeFile(filename, `#!/bin/sh\n${contents}\n`);
      await chmod(filename, SCRIPT_MODE);
    }
  });

  beforeEach(async () => {
    await rm(mountDirectory, { recursive: true, force: true });
    await mkdir(mountDirectory);
    await writeFile(ownerLog, '');
  });

  after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('creates all host identities once, protects them, and repairs missing public metadata', async () => {
    const first = execute();
    assert.equal(first.status, 0, first.stderr);
    const previous = new Map();
    for (const type of ['ed25519', 'ecdsa', 'rsa']) {
      const filename = privatePath(type);
      previous.set(type, await digest(filename));
      // oxlint-disable-next-line no-bitwise -- inspect only POSIX permission bits
      assert.equal((await stat(filename)).mode & PERMISSION_MASK, FILE_MODE);
    }
    // oxlint-disable-next-line no-bitwise -- inspect only POSIX permission bits
    assert.equal((await stat(mountDirectory)).mode & PERMISSION_MASK, DIRECTORY_MODE);
    await rm(`${privatePath('ed25519')}.pub`);
    const repeated = execute();
    assert.equal(repeated.status, 0, repeated.stderr);
    for (const type of ['ed25519', 'ecdsa', 'rsa']) {
      assert.equal(await digest(privatePath(type)), previous.get(type));
      assert.match(
        await readFile(`${privatePath(type)}.pub`, 'utf8'),
        /^(?:ssh-|ecdsa-)/u,
      );
    }
    assert.ok(
      !(await readdir(mountDirectory)).some((name) =>
        name.startsWith('.host-key-stage.'),
      ),
    );
    assert.match(await readFile(ownerLog, 'utf8'), /root:root/u);
  });

  it('generates only missing private keys and preserves the remaining fingerprints', async () => {
    assert.equal(execute().status, 0);
    const previous = await digest(privatePath('ed25519'));
    await rm(privatePath('ecdsa'));
    await rm(`${privatePath('ecdsa')}.pub`);
    const result = execute();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await digest(privatePath('ed25519')), previous);
    assert.ok((await readFile(privatePath('ecdsa'), 'utf8')).includes('PRIVATE KEY'));
  });

  it('rejects invalid existing private keys without replacing them or generating other keys', async () => {
    await writeFile(privatePath('rsa'), 'invalid-host-key');
    const result = execute();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid or encrypted private host key/u);
    assert.equal(await readFile(privatePath('rsa'), 'utf8'), 'invalid-host-key');
    await assert.rejects(stat(privatePath('ed25519')), { code: 'ENOENT' });
    await assert.rejects(stat(privatePath('ecdsa')), { code: 'ENOENT' });
  });

  it('rejects encrypted host keys without prompting', async () => {
    const plain = path.join(directory, 'plain-rsa');
    execFileSync(
      '/usr/bin/ssh-keygen',
      ['-q', '-t', 'rsa', '-m', 'PEM', '-N', '', '-f', plain],
      { timeout: TOOL_TIMEOUT },
    );
    const key = createPrivateKey(await readFile(plain));
    await writeFile(
      privatePath('rsa'),
      key.export({
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: 'disposable-host-key-test',
      }),
    );
    const previous = await digest(privatePath('rsa'));
    const result = execute();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid or encrypted/u);
    assert.equal(await digest(privatePath('rsa')), previous);
  });

  it('fails for missing mounts, read-only storage, non-root callers, and concurrent setup', () => {
    for (const environment of [
      { TEST_MOUNT_STATUS: '1' },
      { TEST_READ_ONLY: 'yes' },
      { TEST_UID: '1000' },
      { TEST_LOCK_STATUS: '1' },
    ]) {
      const result = execute(environment);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /SSH host identity/u);
    }
  });

  it('refuses symlinked keys without touching the target', async () => {
    const outside = path.join(directory, 'outside');
    await writeFile(outside, 'preserve');
    await symlink(outside, privatePath('ed25519'));
    const result = execute();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /symlinked key/u);
    assert.equal(await readFile(outside, 'utf8'), 'preserve');
  });

  it('uses a named dev volume and never deletes it during normal replacement', async () => {
    const configuration = YAML.parse(await readFile('dev/dev.yaml', 'utf8'));
    assert.equal(configuration.volumes['ssh-host-keys'], 'codebox-ssh-host-keys');
    const runner = await readFile('dev/scripts/container-run.sh', 'utf8');
    assert.ok(runner.includes('getsetting volumes.ssh-host-keys'));
    assert.ok(
      runner.includes(
        'type=volume,src=$SSH_HOST_KEYS_VOLUME,dst=/var/lib/codebox/ssh-host-keys,volume-nocopy',
      ),
    );
    for (const filename of [
      'dev/scripts/container-run.sh',
      'dev/scripts/container-delete.sh',
      'dev/scripts/image-delete.sh',
    ]) {
      assert.doesNotMatch(
        await readFile(filename, 'utf8'),
        /docker\s+volume\s+(?:rm|prune)/u,
      );
    }
    const dockerfile = await readFile('Dockerfile', 'utf8');
    assert.doesNotMatch(dockerfile, /^VOLUME\b/mu);
    assert.match(
      dockerfile,
      /apt install[^\n]+\\\n\s+&& sudo rm -f \/etc\/ssh\/ssh_host_/u,
    );
  });
});
