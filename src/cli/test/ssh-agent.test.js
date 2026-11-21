import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createPrivateKey, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import {
  ensureSshAgent,
  getAgentEnvironment,
  getAgentFingerprints,
  SSH_AGENT_SOCKET,
} from '../src/ssh-agent.js';
import { getUnlockIdentities, unlockSshIdentities } from '../src/ssh-unlock.js';

describe('shared SSH agent and unlock', () => {
  const TOOL_TIMEOUT = 30000;
  const PASSPHRASE_BYTES = 24;
  const ENCRYPTED_KEY_COUNT = 2;
  let directory;
  let runtimeDirectory;
  let socket;
  let passphrase;
  let encrypted;
  let pem;
  let plain;
  const run = (command, args) =>
    execFileSync(command, args, {
      timeout: TOOL_TIMEOUT,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
  const terminalRun = (request) => {
    const result = spawnSync('python3', ['src/cli/test/fixtures/ssh-pty.py'], {
      input: JSON.stringify(request),
      encoding: 'utf8',
      timeout: TOOL_TIMEOUT,
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const unlockOptions = (filenames) => ({
    identities: filenames.map((filename) => ({ filename })),
    socket,
    runtimeDirectory,
  });
  /** Run unlock in a real terminal using only disposable test answers. */
  const unlockInTerminal = (options) => {
    const { filenames, answers = [], errors = [] } = options;
    return terminalRun({
      args: [
        process.execPath,
        '--input-type=module',
        '-e',
        `
      import { unlockSshIdentities } from './src/cli/src/ssh-unlock.js';
      const result = await unlockSshIdentities(JSON.parse(process.env.CODEBOX_TEST_OPTIONS));
      process.exitCode = result.failed ? 1 : 0;
    `,
      ],
      env: {
        CODEBOX_TEST_OPTIONS: JSON.stringify({ ...unlockOptions(filenames), errors }),
      },
      answers,
    });
  };
  const stopAgent = async (signal = 'SIGTERM') => {
    try {
      const pid = Number(
        await readFile(path.join(runtimeDirectory, 'agent.pid'), 'utf8'),
      );
      process.kill(pid, signal);
      const exitAttempts = 40;
      const exitDelay = 50;
      for (let attempt = 0; attempt < exitAttempts; attempt += 1) {
        try {
          if (run('/bin/ps', ['-p', String(pid), '-o', 'stat=']).includes('Z')) return;
        } catch (error) {
          if (error.status === 1) return;
          throw error;
        }
        await setTimeout(exitDelay);
      }
      throw new Error('Disposable SSH agent did not exit');
    } catch (error) {
      // A killed process or an agent that was never started needs no further cleanup.
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
    }
  };

  before(async () => {
    directory = await mkdtemp('/tmp/cb-agent-');
    runtimeDirectory = path.join(directory, 'agent');
    encrypted = path.join(directory, 'encrypted');
    pem = path.join(directory, 'pem');
    plain = path.join(directory, 'plain');
    passphrase = randomBytes(PASSPHRASE_BYTES).toString('base64');
    const generation = terminalRun({
      args: ['/usr/bin/ssh-keygen', '-q', '-t', 'ed25519', '-f', encrypted],
      answers: [passphrase, passphrase],
    });
    assert.equal(generation.status, 0);
    run('/usr/bin/ssh-keygen', [
      '-q',
      '-t',
      'rsa',
      '-b',
      '2048',
      '-m',
      'PEM',
      '-N',
      '',
      '-f',
      plain,
    ]);
    const privateKey = createPrivateKey(await readFile(plain));
    await writeFile(
      pem,
      privateKey.export({
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase,
      }),
      { mode: 0o600 },
    );
  });

  beforeEach(async () => {
    await stopAgent();
    await rm(runtimeDirectory, { recursive: true, force: true });
    await rm(`${pem}.pub`, { force: true });
    socket = await ensureSshAgent({ runtimeDirectory });
  });

  after(async () => {
    await stopAgent();
    await rm(directory, { recursive: true, force: true });
  });

  it('starts empty without prompting and reuses the same live agent', async () => {
    const pidFile = path.join(runtimeDirectory, 'agent.pid');
    const pid = await readFile(pidFile, 'utf8');
    assert.deepEqual(await getAgentFingerprints(socket), []);
    assert.equal(await ensureSshAgent({ runtimeDirectory }), socket);
    assert.equal(await readFile(pidFile, 'utf8'), pid);
    assert.deepEqual((await readdir(runtimeDirectory)).sort(), [
      'agent.pid',
      'agent.sock',
    ]);
  });

  it('replaces a killed agent and stale socket without retaining unlocked identities', async () => {
    const loaded = unlockInTerminal({ filenames: [encrypted], answers: [passphrase] });
    assert.equal(loaded.status, 0);
    const previous = await readFile(path.join(runtimeDirectory, 'agent.pid'), 'utf8');
    await stopAgent('SIGKILL');
    socket = await ensureSshAgent({ runtimeDirectory });
    assert.notEqual(
      await readFile(path.join(runtimeDirectory, 'agent.pid'), 'utf8'),
      previous,
    );
    assert.deepEqual(await getAgentFingerprints(socket), []);
    const reloaded = unlockInTerminal({ filenames: [encrypted], answers: [passphrase] });
    assert.equal(reloaded.prompts, 1);
    assert.equal(reloaded.status, 0);
  });

  it('stops its recorded live agent before replacing a removed socket', async () => {
    const pidFile = path.join(runtimeDirectory, 'agent.pid');
    const previous = await readFile(pidFile, 'utf8');
    await rm(socket);
    socket = await ensureSshAgent({ runtimeDirectory });
    assert.notEqual(await readFile(pidFile, 'utf8'), previous);
    assert.deepEqual(await getAgentFingerprints(socket), []);
  });

  it('does not signal an unrelated process when a recorded PID has been reused', async () => {
    await stopAgent();
    await writeFile(path.join(runtimeDirectory, 'agent.pid'), String(process.pid));
    socket = await ensureSshAgent({ runtimeDirectory });
    assert.deepEqual(await getAgentFingerprints(socket), []);
    assert.notEqual(
      Number(await readFile(path.join(runtimeDirectory, 'agent.pid'), 'utf8')),
      process.pid,
    );
  });

  it('rejects concurrent setup and unsafe runtime entries', async () => {
    await writeFile(path.join(runtimeDirectory, 'setup.lock'), '');
    await assert.rejects(ensureSshAgent({ runtimeDirectory }), /locked/u);
    await rm(path.join(runtimeDirectory, 'setup.lock'));
    await stopAgent('SIGKILL');
    await rm(socket, { force: true });
    await symlink(plain, socket);
    await assert.rejects(ensureSshAgent({ runtimeDirectory }), /Unsafe/u);
  });

  it('discovers raw overrides without loading superseded keys or evaluating executable options', async () => {
    const alias = path.join(directory, 'same-key');
    await symlink(encrypted, alias);
    const marker = path.join(directory, 'must-not-exist');
    const ssh = {
      client: {
        hosts: {
          first: {
            key: 'superseded',
            raw: {
              iDeNtItYfIlE: encrypted,
              ProxyCommand: `touch ${marker}`,
              LocalCommand: `touch ${marker}`,
            },
          },
          second: { raw: { IdentityFile: alias } },
          none: { key: 'ignored', raw: { IdentityFile: 'none' } },
        },
      },
    };
    const discovered = await getUnlockIdentities({ ssh });
    assert.equal(discovered.errors.length, 0);
    assert.equal(discovered.identities.length, 1);
    assert.equal(discovered.identities[0].filename, await realpath(encrypted));
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  });

  it('resolves generated identities, home-relative overrides, and quoted literal paths', async () => {
    const home = path.join(directory, 'home');
    const keyDirectory = path.join(home, '.ssh', 'codebox-keys');
    await mkdir(keyDirectory, { recursive: true });
    await writeFile(path.join(keyDirectory, 'service'), await readFile(encrypted));
    const spaced = path.join(directory, 'key with spaces');
    await writeFile(spaced, await readFile(pem));
    const discovery = await getUnlockIdentities({
      home,
      ssh: {
        client: {
          hosts: {
            generated: { key: 'service' },
            homeRelative: { raw: { IdentityFile: '~/.ssh/codebox-keys/service' } },
            quoted: { raw: { IdentityFile: `"${spaced}"` } },
          },
        },
      },
    });
    assert.equal(discovery.errors.length, 0);
    assert.equal(discovery.identities.length, ENCRYPTED_KEY_COUNT);
  });

  it('reports unsupported identity expansion and other-agent overrides while retaining usable identities', async () => {
    for (const value of [
      '%d/key',
      // oxlint-disable-next-line no-template-curly-in-string -- literal SSH environment expansion is intentionally unsupported
      '${HOME}/key',
      '~other/key',
      'relative-key',
      '/tmp/%h',
      '"/tmp/key" extra',
    ]) {
      const discovered = await getUnlockIdentities({
        ssh: { client: { hosts: { test: { raw: { IdentityFile: value } } } } },
      });
      assert.equal(discovered.identities.length, 0);
      assert.equal(discovered.errors.length, 1);
      assert.match(discovered.errors[0], /unsupported|quote|literal/u);
    }
    const discovered = await getUnlockIdentities({
      ssh: {
        client: {
          hosts: {
            valid: { raw: { IdentityFile: encrypted } },
            otherAgent: { raw: { IdentityFile: encrypted, IdentityAgent: 'none' } },
          },
        },
      },
    });
    assert.equal(discovered.identities.length, 1);
    assert.match(discovered.errors[0], /IdentityAgent/u);
  });

  it('unlocks encrypted OpenSSH and PKCS#8 keys and skips later prompts', async () => {
    const first = unlockInTerminal({
      filenames: [encrypted, pem],
      answers: [passphrase, passphrase],
    });
    assert.equal(first.status, 0);
    assert.equal(first.prompts, ENCRYPTED_KEY_COUNT);
    assert.deepEqual(first.summary, [ENCRYPTED_KEY_COUNT, 0, 0]);
    const second = unlockInTerminal({ filenames: [encrypted, pem] });
    assert.equal(second.status, 0);
    assert.equal(second.prompts, 0);
    assert.deepEqual(second.summary, [0, ENCRYPTED_KEY_COUNT, 0]);
    const metadata = await readFile(
      path.join(runtimeDirectory, 'unlocked-fingerprints.json'),
      'utf8',
    );
    assert.ok(!metadata.includes(passphrase));
    assert.doesNotMatch(metadata, /PRIVATE KEY/u);
    const result = spawnSync('/usr/bin/ssh-add', ['-T', `${encrypted}.pub`], {
      env: getAgentEnvironment(socket),
      timeout: TOOL_TIMEOUT,
    });
    assert.equal(result.status, 0);
  });

  it('retains successful unlocks and reports cancellation and partial failures', async () => {
    const result = unlockInTerminal({
      filenames: [encrypted, pem],
      answers: [passphrase, ''],
      errors: ['Host broken: cannot read IdentityFile'],
    });
    assert.equal(result.status, 1);
    assert.deepEqual(result.summary, [1, 0, ENCRYPTED_KEY_COUNT]);
    assert.equal((await getAgentFingerprints(socket)).length, 1);
    const cancelled = unlockInTerminal({
      filenames: [pem],
      answers: [{ signal: 'INT' }],
    });
    assert.equal(cancelled.status, 1);
    assert.equal(cancelled.cancelled, true);
    assert.equal((await getAgentFingerprints(socket)).length, 1);
  });

  it('uses encrypted identities with IdentitiesOnly yes in a disposable loopback SSH session', async () => {
    const probe = createServer();
    await new Promise((resolve) => {
      probe.listen(0, '127.0.0.1', resolve);
    });
    const { port } = probe.address();
    await new Promise((resolve) => {
      probe.close(resolve);
    });
    const authorized = path.join(directory, 'authorized');
    await writeFile(
      authorized,
      `${await readFile(`${encrypted}.pub`, 'utf8')}${await readFile(`${plain}.pub`, 'utf8')}`,
    );
    const serverConfig = path.join(directory, 'sshd_config');
    await writeFile(
      serverConfig,
      [
        `Port ${port}`,
        'ListenAddress 127.0.0.1',
        `HostKey ${plain}`,
        `AuthorizedKeysFile ${authorized}`,
        'StrictModes no',
        'UsePAM no',
        'PasswordAuthentication no',
        'KbdInteractiveAuthentication no',
        'AuthenticationMethods publickey',
        'PubkeyAuthentication yes',
        `PidFile ${directory}/sshd.pid`,
        `SetEnv SSH_AUTH_SOCK=${socket}`,
      ].join('\n'),
    );
    const daemon = spawn('/usr/sbin/sshd', ['-D', '-e', '-f', serverConfig], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let diagnostic = '';
    daemon.stderr.on('data', (chunk) => {
      diagnostic += chunk.toString();
    });
    try {
      const readinessAttempts = 40;
      const readinessDelay = 50;
      let ready = false;
      for (let attempt = 0; attempt < readinessAttempts && !ready; attempt += 1) {
        ready = await new Promise((resolve) => {
          const connection = createConnection({ host: '127.0.0.1', port });
          connection.once('connect', () => {
            connection.destroy();
            resolve(true);
          });
          connection.once('error', () => resolve(false));
        });
        if (!ready) await setTimeout(readinessDelay);
      }
      assert.ok(ready, diagnostic);
      const result = unlockInTerminal({
        filenames: [encrypted, pem],
        answers: [passphrase, passphrase],
      });
      assert.equal(result.status, 0);
      const clientConfig = path.join(directory, 'client_config');
      const { username } = os.userInfo();
      for (const filename of [encrypted, pem]) {
        await writeFile(
          clientConfig,
          [
            'Host disposable',
            '  HostName 127.0.0.1',
            `  Port ${port}`,
            `  User ${username}`,
            `  IdentityFile "${filename}"`,
            `  IdentityAgent "${socket}"`,
            '  IdentitiesOnly yes',
            '  BatchMode yes',
            '  StrictHostKeyChecking no',
            '  UserKnownHostsFile /dev/null',
            '  LogLevel ERROR',
          ].join('\n'),
        );
        const client = spawnSync(
          '/usr/bin/ssh',
          [
            '-F',
            clientConfig,
            'disposable',
            `test "$SSH_AUTH_SOCK" = '${socket}' && ssh-add -l >/dev/null`,
          ],
          {
            timeout: TOOL_TIMEOUT,
            encoding: 'utf8',
          },
        );
        assert.equal(
          client.status,
          0,
          `${path.basename(filename)}: ${client.stderr}; ${diagnostic}`,
        );
      }
    } finally {
      if (daemon.exitCode === null && daemon.signalCode === null) {
        const exited = once(daemon, 'exit');
        daemon.kill('SIGTERM');
        await exited;
      }
    }
  });

  it('deduplicates symlinked legacy keys while providing each configured runtime public path', async () => {
    const linked = path.join(directory, 'linked-pem');
    await symlink(pem, linked);
    const discovery = await getUnlockIdentities({
      ssh: {
        client: {
          hosts: {
            first: { raw: { IdentityFile: pem } },
            second: { raw: { IdentityFile: linked } },
          },
        },
      },
    });
    const request = { ...unlockOptions([]), ...discovery };
    const result = terminalRun({
      args: [
        process.execPath,
        '--input-type=module',
        '-e',
        `
        import { unlockSshIdentities } from './src/cli/src/ssh-unlock.js';
        const result = await unlockSshIdentities(JSON.parse(process.env.CODEBOX_TEST_OPTIONS));
        process.exitCode = result.failed ? 1 : 0;
      `,
      ],
      env: { CODEBOX_TEST_OPTIONS: JSON.stringify(request) },
      answers: [passphrase],
    });
    assert.equal(result.status, 0);
    assert.equal(result.prompts, 1);
    assert.equal(
      await readFile(`${pem}.pub`, 'utf8'),
      await readFile(`${linked}.pub`, 'utf8'),
    );
  });

  it('reports ambiguous externally loaded legacy identities without guessing a public companion', async () => {
    const preload = terminalRun({
      args: ['/usr/bin/ssh-add', '-q', '-k', encrypted, pem],
      env: getAgentEnvironment(socket),
      answers: [passphrase, passphrase],
    });
    assert.equal(preload.status, 0);
    const result = unlockInTerminal({ filenames: [pem], answers: [passphrase] });
    assert.equal(result.status, 1);
    assert.deepEqual(result.summary, [1, 0, 1]);
    await assert.rejects(readFile(`${pem}.pub`), { code: 'ENOENT' });
    assert.equal((await getAgentFingerprints(socket)).length, ENCRYPTED_KEY_COUNT);
  });

  it('never overwrites a conflicting runtime public companion', async () => {
    await writeFile(`${pem}.pub`, 'preserve-this-file\n');
    const result = unlockInTerminal({ filenames: [pem], answers: [passphrase] });
    assert.equal(result.status, 1);
    assert.deepEqual(result.summary, [1, 0, 1]);
    assert.equal(await readFile(`${pem}.pub`, 'utf8'), 'preserve-this-file\n');
    assert.equal((await getAgentFingerprints(socket)).length, 1);
  });

  it('keeps interactive unlock attached to the terminal through the CLI wrapper', async () => {
    const fakeCli = path.join(directory, 'cli');
    await mkdir(path.join(fakeCli, 'src'), { recursive: true });
    await writeFile(path.join(fakeCli, '.node-version'), process.version);
    await writeFile(
      path.join(fakeCli, 'src', 'index.js'),
      'process.exitCode = process.stdout.isTTY ? 0 : 1;',
    );
    const wrapper = (await readFile('src/cli/bin.sh', 'utf8')).replace(
      '/home/coder/.codebox/cli',
      fakeCli,
    );
    const result = terminalRun({
      args: ['/bin/zsh', '-c', wrapper, 'codeboxcli', 'unlock-ssh-keys'],
    });
    assert.equal(result.status, 0);
  });

  it('reports unavailable agents and missing controlling terminals', async () => {
    await assert.rejects(
      unlockSshIdentities({
        ...unlockOptions([encrypted]),
        socket: path.join(directory, 'missing'),
      }),
      /unavailable/u,
    );
    const source = `
      import { unlockSshIdentities } from './src/cli/src/ssh-unlock.js';
      const result = await unlockSshIdentities(${JSON.stringify(unlockOptions([encrypted]))});
      process.exitCode = result.failed ? 1 : 0;
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
      detached: true,
      encoding: 'utf8',
      timeout: TOOL_TIMEOUT,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no controlling terminal/u);
  });

  it('wires the same socket to Docker children and SSH sessions and rejects extra unlock arguments', async () => {
    const dockerfile = await readFile('Dockerfile', 'utf8');
    const policy = await readFile('src/sshd_config', 'utf8');
    assert.ok(dockerfile.includes(`ENV SSH_AUTH_SOCK=${SSH_AGENT_SOCKET}`));
    assert.ok(policy.includes(`SetEnv SSH_AUTH_SOCK=${SSH_AGENT_SOCKET}`));
    const effective = run('/usr/sbin/sshd', ['-T', '-f', 'src/sshd_config', '-h', plain]);
    assert.ok(effective.includes(`setenv SSH_AUTH_SOCK=${SSH_AGENT_SOCKET}`));
    const result = spawnSync(
      process.execPath,
      ['src/cli/src/index.js', 'unlock-ssh-keys', 'host'],
      {
        encoding: 'utf8',
        timeout: TOOL_TIMEOUT,
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no arguments|Unknown argument/u);
  });
});
