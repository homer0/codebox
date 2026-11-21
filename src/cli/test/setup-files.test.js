import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CODEBOX_CONFIG } from '../src/consts.js';
import { runSetupFiles } from '../src/setup-files.js';

describe('box setup files', () => {
  const FILE_MODE = 0o600;
  const INVALID_NON_STRING = 42;
  const TOOL_TIMEOUT = 10000;
  let directory;
  let trace;

  const createScript = async (name, contents) => {
    const filename = path.join(directory, name);
    await writeFile(filename, contents, { mode: FILE_MODE });
    return filename;
  };
  const appendTrace = (value) => `printf '%s\\n' '${value}' >> '${trace}'\n`;

  beforeEach(async () => {
    directory = await mkdtemp('/tmp/codebox-setup-files-');
    trace = path.join(directory, 'trace');
    await writeFile(trace, '');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('defaults to an empty list and does nothing without scripts', async () => {
    assert.deepEqual(DEFAULT_CODEBOX_CONFIG.box['setup-files'], []);
    await runSetupFiles([]);
    assert.equal(await readFile(trace, 'utf8'), '');
  });

  it('runs non-executable scripts in order using Bash on every invocation', async () => {
    const first = await createScript(
      'first script.sh',
      `#!/bin/false\nvalues=(bash works)\n[[ "$values" == bash ]] || exit 1\n${appendTrace('first')}`,
    );
    const second = await createScript('second.sh', appendTrace('second'));
    await runSetupFiles([first, second]);
    await runSetupFiles([first, second]);
    assert.equal(await readFile(trace, 'utf8'), 'first\nsecond\nfirst\nsecond\n');
  });

  it('rejects malformed lists and paths before running a script', async () => {
    const first = await createScript('first.sh', appendTrace('must not run'));
    for (const invalid of [undefined, null, 'script.sh', {}, INVALID_NON_STRING]) {
      await assert.rejects(runSetupFiles(invalid), /must be an array/u);
    }
    for (const invalid of [
      '',
      'relative.sh',
      '~/script.sh',
      INVALID_NON_STRING,
      null,
      {},
      path.join(directory, 'script.txt'),
      path.join(directory, 'line\nbreak.sh'),
      path.join(directory, 'line\rbreak.sh'),
      path.join(directory, 'null\0byte.sh'),
    ]) {
      await assert.rejects(
        runSetupFiles([first, invalid]),
        /absolute paths to .sh files/u,
      );
    }
    assert.equal(await readFile(trace, 'utf8'), '');
  });

  it('validates all files before execution, rejecting missing files and directories', async () => {
    const first = await createScript('first.sh', appendTrace('must not run'));
    const folder = path.join(directory, 'folder.sh');
    await mkdir(folder);
    for (const invalid of [path.join(directory, 'missing.sh'), folder]) {
      await assert.rejects(
        runSetupFiles([first, invalid]),
        /Cannot read box.setup-files script/u,
      );
    }
    assert.equal(await readFile(trace, 'utf8'), '');
  });

  it('rejects unreadable files before running earlier scripts', async (context) => {
    if (os.userInfo().uid === 0) {
      context.skip('Root bypasses ordinary file read permissions');
      return;
    }
    const first = await createScript('first.sh', appendTrace('must not run'));
    const unreadable = await createScript('unreadable.sh', 'exit 0\n');
    await chmod(unreadable, 0o000);
    try {
      await assert.rejects(
        runSetupFiles([first, unreadable]),
        /Cannot read box.setup-files script/u,
      );
      assert.equal(await readFile(trace, 'utf8'), '');
    } finally {
      await chmod(unreadable, FILE_MODE);
    }
  });

  it('supports symlinks to regular files and rejects dangling links', async () => {
    const target = await createScript('target.sh', appendTrace('linked'));
    const link = path.join(directory, 'link.sh');
    await symlink(target, link);
    await runSetupFiles([link]);
    await rm(target);
    await assert.rejects(runSetupFiles([link]), /Cannot read box.setup-files script/u);
    assert.equal(await readFile(trace, 'utf8'), 'linked\n');
  });

  it('stops on failure without rolling back earlier scripts or running later ones', async () => {
    const first = await createScript('first.sh', appendTrace('first'));
    const failure = await createScript('failure.sh', `${appendTrace('failed')}exit 23\n`);
    const last = await createScript('last.sh', appendTrace('must not run'));
    await assert.rejects(
      runSetupFiles([first, failure, last]),
      /failure\.sh \(exit 23\)/u,
    );
    assert.equal(await readFile(trace, 'utf8'), 'first\nfailed\n');
  });

  it('reports scripts terminated by a signal', async () => {
    const filename = await createScript('signal.sh', 'kill -TERM $$\n');
    await assert.rejects(runSetupFiles([filename]), /signal SIGTERM/u);
  });

  it('keeps script environment and directory changes out of later scripts', async () => {
    const first = await createScript(
      'first.sh',
      'export CODEBOX_TEST_SETUP_LOCAL=changed\ncd /\n',
    );
    const second = await createScript(
      'second.sh',
      `[[ -z "$CODEBOX_TEST_SETUP_LOCAL" ]] || exit 1\n[[ "$PWD" == '${process.cwd()}' ]] || exit 1\n${appendTrace('isolated')}`,
    );
    await runSetupFiles([first, second]);
    assert.equal(await readFile(trace, 'utf8'), 'isolated\n');
  });

  it('processes packages before scripts and leaves SSH stopped on either failure', async () => {
    const entrypoint = await readFile('src/codebox-entrypoint.sh', 'utf8');
    const setupStart = entrypoint.indexOf('# Install configured box packages');
    const setupEnd = entrypoint.indexOf('# Update oh-my-zsh theme');
    const activationStart = entrypoint.indexOf('# Validate daemon configuration');
    const activationEnd = entrypoint.indexOf('# Restart nginx');
    assert.ok(setupStart >= 0 && setupEnd > setupStart);
    assert.ok(activationStart > setupEnd && activationEnd > activationStart);
    const setup = entrypoint.slice(setupStart, setupEnd);
    const activation = entrypoint.slice(activationStart, activationEnd);
    const mocks = `
      codeboxcli() {
        if [[ $1 == get-setting ]]; then print -r -- "$PACKAGES"; return 0; fi
        print scripts >> "$TRACE"
        return "$SCRIPT_STATUS"
      }
      sudo() {
        if [[ $1 == apt-get ]]; then print update >> "$TRACE"; return "$UPDATE_STATUS"; fi
        if [[ $1 == env ]]; then print install >> "$TRACE"; return "$INSTALL_STATUS"; fi
        if [[ $1 == service ]]; then print -r -- "$3" >> "$TRACE"; fi
        return 0
      }
    `;
    for (const scenario of [
      { actions: 'update\ninstall\nscripts\nstart\n' },
      { packages: '', actions: 'scripts\nstart\n' },
      { updateStatus: '1', actions: 'update\n', failed: true },
      { installStatus: '1', actions: 'update\ninstall\n', failed: true },
      { scriptStatus: '1', actions: 'update\ninstall\nscripts\n', failed: true },
    ]) {
      await writeFile(trace, '');
      const result = spawnSync(
        '/bin/zsh',
        ['-f', '-c', `${mocks}\n${setup}\n${activation}`],
        {
          timeout: TOOL_TIMEOUT,
          encoding: 'utf8',
          env: {
            PATH: '/usr/bin:/bin',
            TRACE: trace,
            PACKAGES:
              typeof scenario.packages === 'undefined' ? 'ffmpeg' : scenario.packages,
            UPDATE_STATUS: scenario.updateStatus || '0',
            INSTALL_STATUS: scenario.installStatus || '0',
            SCRIPT_STATUS: scenario.scriptStatus || '0',
          },
        },
      );
      assert.equal(result.status, scenario.failed ? 1 : 0, result.stderr);
      assert.equal(await readFile(trace, 'utf8'), scenario.actions);
    }
    const cli = await readFile('src/cli/src/index.js', 'utf8');
    assert.match(cli, /'run-setup-files'/u);
    assert.match(cli, /await runConfiguredSetupFiles\(\)/u);
  });
});
