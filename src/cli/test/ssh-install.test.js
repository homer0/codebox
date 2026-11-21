import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { installSshState } from '../src/ssh-install.js';

describe('managed SSH installation', () => {
  const PERMISSION_MASK = 0o777;
  const DIRECTORY_MODE = 0o700;
  const READ_ONLY_DIRECTORY_MODE = 0o500;
  const FILE_MODE = 0o600;
  let directory;
  let sourceDirectory;
  let sshDirectory;
  let publicKey;
  let replacementKey;
  const run = (command, args) =>
    execFileSync(command, args, {
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
  const config = () => ({
    'authorized-keys': ['device'],
    client: {
      hosts: { service: { hostname: 'example.com', user: 'git', key: 'outbound' } },
    },
  });
  const install = (ssh = config()) =>
    installSshState({ ssh, sourceDirectory, sshDirectory });
  const permissions = async (filename) => {
    const entry = await stat(filename);
    const user = os.userInfo();
    assert.equal(entry.uid, user.uid);
    assert.equal(entry.gid, user.gid);
    // oxlint-disable-next-line no-bitwise -- inspect POSIX permission bits only
    return entry.mode & PERMISSION_MASK;
  };

  before(async () => {
    directory = await mkdtemp('/tmp/codebox-install-test-');
    sourceDirectory = path.join(directory, 'source');
    sshDirectory = path.join(directory, 'home', '.ssh');
    await mkdir(sourceDirectory);
    for (const name of ['outbound', 'replacement']) {
      run('ssh-keygen', [
        '-q',
        '-t',
        'ed25519',
        '-N',
        '',
        '-f',
        path.join(sourceDirectory, name),
      ]);
    }
    publicKey = await readFile(path.join(sourceDirectory, 'outbound.pub'), 'utf8');
    replacementKey = await readFile(
      path.join(sourceDirectory, 'replacement.pub'),
      'utf8',
    );
    await writeFile(path.join(sourceDirectory, 'device'), publicKey);
  });

  beforeEach(async () => {
    await chmod(sourceDirectory, DIRECTORY_MODE);
    await rm(path.join(directory, 'home'), { recursive: true, force: true });
    await mkdir(path.dirname(sshDirectory), { recursive: true });
    await writeFile(path.join(sourceDirectory, 'device'), publicKey);
  });

  after(async () => {
    await chmod(sourceDirectory, DIRECTORY_MODE);
    await rm(directory, { recursive: true, force: true });
  });

  it('installs fresh and repeated state with exact modes and no source-directory nesting', async () => {
    await chmod(sourceDirectory, READ_ONLY_DIRECTORY_MODE);
    await install();
    const initialConfig = await readFile(path.join(sshDirectory, 'config'), 'utf8');
    await install();
    assert.equal(await permissions(sshDirectory), DIRECTORY_MODE);
    assert.equal(
      await permissions(path.join(sshDirectory, 'codebox-keys')),
      DIRECTORY_MODE,
    );
    for (const name of ['authorized_keys', 'config', 'codebox-keys/outbound']) {
      assert.equal(await permissions(path.join(sshDirectory, name)), FILE_MODE);
    }
    assert.deepEqual((await readdir(sshDirectory)).sort(), [
      'authorized_keys',
      'codebox-keys',
      'config',
    ]);
    assert.deepEqual(await readdir(path.join(sshDirectory, 'codebox-keys')), [
      'outbound',
    ]);
    assert.equal(
      await readFile(path.join(sshDirectory, 'config'), 'utf8'),
      initialConfig,
    );
    assert.equal(
      await readFile(path.join(sshDirectory, 'authorized_keys'), 'utf8'),
      publicKey,
    );
    assert.equal(await readFile(path.join(sourceDirectory, 'device'), 'utf8'), publicKey);
  });

  it('reconciles revocation/removal and deletes only known legacy defaults', async () => {
    await install();
    for (const name of ['known_hosts', 'personal-key', 'id_rsa', 'id_rsa.pub']) {
      await writeFile(path.join(sshDirectory, name), name);
    }
    await mkdir(path.join(sshDirectory, 'unrelated'));
    await writeFile(path.join(sshDirectory, 'unrelated', 'keep'), 'keep');
    await writeFile(path.join(sourceDirectory, 'device'), replacementKey);
    await install({ 'authorized-keys': ['device'] });
    assert.equal(
      await readFile(path.join(sshDirectory, 'authorized_keys'), 'utf8'),
      replacementKey,
    );
    assert.equal(await readFile(path.join(sshDirectory, 'config'), 'utf8'), '');
    assert.deepEqual(await readdir(path.join(sshDirectory, 'codebox-keys')), []);
    for (const name of ['known_hosts', 'personal-key']) {
      assert.equal(await readFile(path.join(sshDirectory, name), 'utf8'), name);
    }
    assert.equal(
      await readFile(path.join(sshDirectory, 'unrelated', 'keep'), 'utf8'),
      'keep',
    );
    for (const name of ['id_rsa', 'id_rsa.pub']) {
      await assert.rejects(lstat(path.join(sshDirectory, name)), { code: 'ENOENT' });
    }
  });

  it('validates every credential before changing installed authorization', async () => {
    await install();
    const ssh = config();
    ssh.client.hosts.service.key = 'missing';
    await writeFile(path.join(sourceDirectory, 'device'), replacementKey);
    await assert.rejects(install(ssh), /cannot read/u);
    assert.equal(
      await readFile(path.join(sshDirectory, 'authorized_keys'), 'utf8'),
      publicKey,
    );
    assert.deepEqual((await readdir(sshDirectory)).sort(), [
      'authorized_keys',
      'codebox-keys',
      'config',
    ]);
  });

  it('refuses unsafe destination types and does not follow SSH directory symlinks', async () => {
    const outside = path.join(directory, 'outside');
    await mkdir(outside, { recursive: true });
    await symlink(outside, sshDirectory);
    await assert.rejects(install(), /real directory/u);
    assert.deepEqual(await readdir(outside), []);
    await rm(sshDirectory);
    await mkdir(sshDirectory);
    await symlink(outside, path.join(sshDirectory, 'codebox-keys'));
    await assert.rejects(install(), /real managed directory/u);
    await rm(path.join(sshDirectory, 'codebox-keys'));
    await mkdir(path.join(sshDirectory, 'authorized_keys'));
    await assert.rejects(install(), /unexpected destination type/u);
  });

  it('validates the explicit daemon policy with local OpenSSH and disposable host keys', async () => {
    const configPath = path.resolve('src/sshd_config');
    const effective = run('/usr/sbin/sshd', [
      '-T',
      '-f',
      configPath,
      '-h',
      path.join(sourceDirectory, 'outbound'),
      '-C',
      'user=coder,host=localhost,addr=127.0.0.1',
    ]);
    const effectiveLines = effective.split('\n');
    for (const expected of [
      'pubkeyauthentication yes',
      'passwordauthentication no',
      'kbdinteractiveauthentication no',
      'authenticationmethods publickey',
      'authorizedkeysfile .ssh/authorized_keys',
      'usepam yes',
      'port 22',
      'subsystem sftp internal-sftp',
      'hostkey /var/lib/codebox/ssh-host-keys/ssh_host_ed25519_key',
      'hostkey /var/lib/codebox/ssh-host-keys/ssh_host_ecdsa_key',
      'hostkey /var/lib/codebox/ssh-host-keys/ssh_host_rsa_key',
    ]) {
      assert.ok(effectiveLines.includes(expected), expected);
    }
    const policy = await readFile(configPath, 'utf8');
    assert.doesNotMatch(policy, /^\s*(?:Include|Match)\s/gmu);
  });

  it('keeps the service stopped on install/configuration failures and starts only after checks', async () => {
    const entrypoint = await readFile('src/codebox-entrypoint.sh', 'utf8');
    const stop = entrypoint.slice(
      entrypoint.indexOf('# Stop accepting'),
      entrypoint.indexOf('CODEBOX_NAME='),
    );
    const installation = entrypoint.slice(
      entrypoint.indexOf('# Validate all desired credentials'),
      entrypoint.indexOf('# Make explicitly allowed'),
    );
    const activation = entrypoint.slice(
      entrypoint.indexOf('# Validate daemon configuration'),
      entrypoint.indexOf('# Restart nginx'),
    );
    const trace = path.join(directory, 'service-trace');
    const mocks = `
      sudo() {
        if [[ $1 == service ]]; then
          print -r -- "$3" >> "$TRACE"
          if [[ $3 == stop && $STOP_FAIL == yes ]]; then return 1; fi
          if [[ $3 == status ]]; then
            if [[ $STILL_RUNNING == yes ]]; then return 0; fi
            if [[ $STATUS_FAIL == yes ]]; then return 4; fi
            if [[ $STALE_PID == yes ]]; then return 1; fi
            return 3
          fi
          if [[ $3 == start && $START_FAIL == yes ]]; then return 1; fi
          return 0
        fi
        if [[ $1 == /usr/local/lib/codebox/setup-ssh-host-keys.sh && $HOST_KEYS_FAIL == yes ]]; then return 1; fi
        if [[ $1 == /usr/sbin/sshd ]]; then
          if [[ $DAEMON_FAIL == yes ]]; then return 1; fi
        fi
        return 0
      }
      codeboxcli() { return "$INSTALL_STATUS"; }
    `;
    const stoppedActions = ['stop', 'status'];
    for (const scenario of [
      { installStatus: 1, actions: stoppedActions },
      { hostKeysFail: 'yes', actions: stoppedActions },
      { stopFail: 'yes', actions: ['stop'] },
      { stillRunning: 'yes', actions: stoppedActions },
      { statusFail: 'yes', actions: stoppedActions },
      { daemonFail: 'yes', actions: stoppedActions },
      { startFail: 'yes', actions: ['stop', 'status', 'start', 'stop'] },
      { success: true, actions: ['stop', 'status', 'start'] },
      { stalePid: 'yes', success: true, actions: ['stop', 'status', 'start'] },
    ]) {
      await writeFile(trace, '');
      const result = spawnSync(
        '/bin/zsh',
        ['-c', `${mocks}\n${stop}\n${installation}\n${activation}`],
        {
          timeout: 10000,
          encoding: 'utf8',
          env: {
            TRACE: trace,
            INSTALL_STATUS: String(scenario.installStatus || 0),
            HOST_KEYS_FAIL: scenario.hostKeysFail || 'no',
            STOP_FAIL: scenario.stopFail || 'no',
            STILL_RUNNING: scenario.stillRunning || 'no',
            STATUS_FAIL: scenario.statusFail || 'no',
            STALE_PID: scenario.stalePid || 'no',
            DAEMON_FAIL: scenario.daemonFail || 'no',
            START_FAIL: scenario.startFail || 'no',
            PATH: '/usr/bin:/bin',
          },
        },
      );
      assert.equal(result.status, scenario.success ? 0 : 1, result.stderr);
      const actions = (await readFile(trace, 'utf8')).trim().split('\n');
      assert.deepEqual(actions, scenario.actions);
    }
  });

  it('preserves Node errors through the shell CLI wrapper', async () => {
    await writeFile(path.join(directory, '.node-version'), 'v26');
    const wrapper = (await readFile('src/cli/bin.sh', 'utf8')).replace(
      '/home/coder/.codebox/cli',
      directory,
    );
    const result = spawnSync(
      '/bin/zsh',
      [
        '-c',
        `
      node() { if [[ $1 == -v ]]; then print v26; else print failure; return 17; fi; }
      ${wrapper}
    `,
      ],
      { timeout: 10000, encoding: 'utf8' },
    );
    const expectedExitStatus = 17;
    assert.equal(result.status, expectedExitStatus);
    assert.equal(result.stdout, 'failure');
  });
});
