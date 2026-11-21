import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

describe('host Docker startup', () => {
  const SCRIPT_MODE = 0o755;
  const TOOL_TIMEOUT = 5000;
  let directory;
  let binaries;
  let socketPath;
  let script;
  let commandLog;
  let server;

  const execute = (environment = {}) =>
    spawnSync('/bin/sh', [script, '--bind-addr', '0.0.0.0:8080', 'project with spaces'], {
      timeout: TOOL_TIMEOUT,
      encoding: 'utf8',
      env: {
        PATH: `${binaries}:/usr/bin:/bin`,
        TEST_LOG: commandLog,
        TEST_GROUP: 'existing-docker',
        TEST_GROUPADD_STATUS: '0',
        TEST_USERMOD_STATUS: '0',
        TEST_SETUP_STATUS: '0',
        TEST_BASE_STATUS: '0',
        ...environment,
      },
    });

  /** Create a real socket; no Docker daemon or privileged operations are needed. */
  const bindSocket = async () => {
    server = createServer();
    server.listen(socketPath);
    await once(server, 'listening');
  };

  beforeEach(async () => {
    directory = await mkdtemp('/tmp/codebox-docker-');
    binaries = path.join(directory, 'bin');
    socketPath = path.join(directory, 'docker.sock');
    script = path.join(directory, 'entrypoint.sh');
    commandLog = path.join(directory, 'commands');
    await mkdir(binaries);
    await writeFile(commandLog, '');
    const baseEntrypoint = path.join(binaries, 'base-entrypoint');
    const setupEntrypoint = path.join(binaries, 'codebox-setup');
    const original = await readFile('src/docker-entrypoint.sh', 'utf8');
    await writeFile(
      script,
      original
        .replaceAll('/var/run/docker.sock', socketPath)
        .replaceAll('/usr/bin/entrypoint.sh', baseEntrypoint)
        .replaceAll('/usr/local/lib/codebox/codebox-entrypoint.sh', setupEntrypoint),
    );
    const commands = {
      fixuid: 'printf "fixuid\\n" >> "$TEST_LOG"',
      id: 'echo coder',
      stat: 'echo 4321',
      getent:
        'if [ -n "$TEST_GROUP" ]; then printf "%s:x:4321:\\n" "$TEST_GROUP"; else exit 2; fi',
      groupadd: 'exit "$TEST_GROUPADD_STATUS"',
      usermod: 'exit "$TEST_USERMOD_STATUS"',
      sudo: 'printf "sudo %s\\n" "$*" >> "$TEST_LOG"\nif [ "$1" = -E ]; then shift 5; fi\nexec "$@"',
      'codebox-setup': 'printf "setup\\n" >> "$TEST_LOG"\nexit "$TEST_SETUP_STATUS"',
      'base-entrypoint':
        'printf "base\\n" >> "$TEST_LOG"\nprintf "arg=%s\\n" "$@" >> "$TEST_LOG"\n' +
        'if [ -n "$ENTRYPOINTD" ]; then printf "hooks=%s\\n" "$ENTRYPOINTD" >> "$TEST_LOG"; fi\n' +
        'exit "$TEST_BASE_STATUS"',
    };
    for (const [name, contents] of Object.entries(commands)) {
      const filename = path.join(binaries, name);
      await writeFile(filename, `#!/bin/sh\n${contents}\n`);
      await chmod(filename, SCRIPT_MODE);
    }
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      server = undefined;
    }
    await rm(directory, { recursive: true, force: true });
  });

  it('starts normally without a socket and preserves argument boundaries', async () => {
    const result = execute();
    assert.equal(result.status, 0, result.stderr);
    const commands = await readFile(commandLog, 'utf8');
    assert.match(commands, /^fixuid\nsudo -E -H -u coder -- \/bin\/sh -ec/u);
    assert.match(
      commands,
      /\nsetup\nbase\narg=--bind-addr\narg=0\.0\.0\.0:8080\narg=project with spaces\n$/u,
    );
    assert.doesNotMatch(commands, /groupadd|usermod/u);
  });

  it('reuses the socket group and refreshes groups before starting code-server', async () => {
    await bindSocket();
    const result = execute();
    assert.equal(result.status, 0, result.stderr);
    const commands = await readFile(commandLog, 'utf8');
    assert.match(commands, /sudo usermod --append --groups existing-docker coder\n/u);
    assert.ok(commands.includes('sudo -E -H -u coder -- /bin/sh -ec'));
    assert.match(commands, /\nsetup\nbase\n/u);
    assert.match(
      commands,
      /base\narg=--bind-addr\narg=0\.0\.0\.0:8080\narg=project with spaces\n$/u,
    );
    assert.doesNotMatch(commands, /groupadd|chmod|chown/u);
  });

  it('creates a group matching an unknown socket GID', async () => {
    await bindSocket();
    const result = execute({ TEST_GROUP: '' });
    assert.equal(result.status, 0, result.stderr);
    const commands = await readFile(commandLog, 'utf8');
    assert.match(commands, /sudo groupadd --gid 4321 codebox-docker-4321\n/u);
    assert.match(commands, /sudo usermod --append --groups codebox-docker-4321 coder\n/u);
    assert.match(commands, /\nbase\n/u);
  });

  it('rejects a regular file instead of treating it as an absent socket', async () => {
    await writeFile(socketPath, 'not a socket');
    const result = execute();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a Unix socket/u);
    assert.equal(await readFile(commandLog, 'utf8'), 'fixuid\n');
  });

  it('rejects a dangling socket symlink', async () => {
    await symlink(path.join(directory, 'missing'), socketPath);
    const result = execute();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a Unix socket/u);
    assert.equal(await readFile(commandLog, 'utf8'), 'fixuid\n');
  });

  it('does not start code-server when group creation fails', async () => {
    await bindSocket();
    const result = execute({ TEST_GROUP: '', TEST_GROUPADD_STATUS: '1' });
    assert.equal(result.status, 1);
    const commands = await readFile(commandLog, 'utf8');
    assert.match(commands, /sudo groupadd/u);
    assert.doesNotMatch(commands, /usermod|sudo -E|\nsetup\n|\nbase\n/u);
  });

  it('does not start code-server when membership setup fails', async () => {
    await bindSocket();
    const result = execute({ TEST_USERMOD_STATUS: '1' });
    assert.equal(result.status, 1);
    const commands = await readFile(commandLog, 'utf8');
    assert.match(commands, /sudo usermod/u);
    assert.doesNotMatch(commands, /sudo -E|\nsetup\n|\nbase\n/u);
  });

  it('stops before the base entrypoint when setup fails, with or without a socket', async () => {
    const setupFailureStatus = 17;
    for (const socketEnabled of [false, true]) {
      if (socketEnabled) await bindSocket();
      await writeFile(commandLog, '');
      const result = execute({ TEST_SETUP_STATUS: String(setupFailureStatus) });
      assert.equal(result.status, setupFailureStatus, result.stderr);
      const commands = await readFile(commandLog, 'utf8');
      assert.match(commands, /\nsetup\n$/u);
      assert.doesNotMatch(commands, /\nbase\n/u);
    }
  });

  it('runs setup once and preserves the base hook directory', async () => {
    const hooks = path.join(directory, 'custom-hooks');
    const result = execute({ ENTRYPOINTD: hooks });
    assert.equal(result.status, 0, result.stderr);
    const commands = await readFile(commandLog, 'utf8');
    assert.equal(commands.split('\n').filter((line) => line === 'setup').length, 1);
    assert.ok(commands.endsWith(`hooks=${hooks}\n`));
  });

  it('preserves the base entrypoint exit status after successful setup', async () => {
    const baseFailureStatus = 19;
    const result = execute({ TEST_BASE_STATUS: String(baseFailureStatus) });
    assert.equal(result.status, baseFailureStatus, result.stderr);
    assert.match(await readFile(commandLog, 'utf8'), /\nsetup\nbase\n/u);
  });

  it('keeps codebox setup and its helper outside the base hook directory', async () => {
    const dockerfile = await readFile('Dockerfile', 'utf8');
    assert.ok(dockerfile.includes('ENV ENTRYPOINTD=/home/coder/entrypoint.d'));
    assert.ok(
      dockerfile.includes(
        'COPY ./src/codebox-entrypoint.sh /usr/local/lib/codebox/codebox-entrypoint.sh',
      ),
    );
    assert.ok(
      dockerfile.includes(
        'COPY ./src/patch-pwa-manifest.mjs /usr/local/lib/codebox/patch-pwa-manifest.mjs',
      ),
    );
    assert.doesNotMatch(dockerfile, /COPY[^\n]*\/home\/coder\/entrypoint\.d\//u);
    const setup = await readFile('src/codebox-entrypoint.sh', 'utf8');
    assert.ok(setup.includes('node /usr/local/lib/codebox/patch-pwa-manifest.mjs'));
  });
});
