import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createPrivateKey } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { getDesiredSshState } from '../src/ssh.js';

describe('SSH desired state', () => {
  let directory;
  let publicKey;
  const run = (command, args) =>
    execFileSync(command, args, {
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
  const config = () => ({
    'authorized-keys': ['laptop'],
    client: {
      hosts: {
        personal: { hostname: 'github.com', user: 'git', key: 'service' },
      },
    },
  });
  const desired = (ssh) => getDesiredSshState({ ssh, sourceDirectory: directory });

  before(async () => {
    directory = await realpath(await mkdtemp('/tmp/codebox-ssh-test-'));
    for (const [name, format, passphrase] of [
      ['service', 'OPENSSH', ''],
      ['encrypted', 'OPENSSH', 'disposable-test-only'],
      ['pem', 'PEM', 'disposable-test-only'],
    ]) {
      run('ssh-keygen', [
        '-q',
        '-t',
        'rsa',
        '-b',
        '2048',
        ...(format === 'PEM' ? ['-m', format] : []),
        '-N',
        passphrase,
        '-f',
        path.join(directory, name),
      ]);
      // Remove companion files to prove validation never infers a public/private pair.
      await rm(path.join(directory, `${name}.pub`));
    }
    run('ssh-keygen', [
      '-q',
      '-t',
      'ed25519',
      '-N',
      'disposable-test-only',
      '-f',
      path.join(directory, 'ed25519'),
    ]);
    await rm(path.join(directory, 'ed25519.pub'));
    for (const [name, cipher] of [
      ['gcm', 'aes256-gcm@openssh.com'],
      ['chacha', 'chacha20-poly1305@openssh.com'],
    ]) {
      run('ssh-keygen', [
        '-q',
        '-t',
        'ed25519',
        '-Z',
        cipher,
        '-N',
        'disposable-test-only',
        '-f',
        path.join(directory, name),
      ]);
      await rm(path.join(directory, `${name}.pub`));
    }
    const pem = await readFile(path.join(directory, 'pem'), 'utf8');
    const pkcs8 = createPrivateKey({
      key: pem,
      passphrase: 'disposable-test-only',
    }).export({
      type: 'pkcs8',
      format: 'pem',
      cipher: 'aes-256-cbc',
      passphrase: 'disposable-test-only',
    });
    await writeFile(path.join(directory, 'pkcs8'), pkcs8, { mode: 0o600 });
    publicKey = run('ssh-keygen', [
      '-y',
      '-P',
      '',
      '-f',
      path.join(directory, 'service'),
    ]).trim();
    await writeFile(path.join(directory, 'laptop'), `${publicKey}\n`);
    await writeFile(path.join(directory, 'garbage'), 'not a key\n');
    await symlink('/etc/passwd', path.join(directory, 'escape'));
  });

  after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('renders exact filenames, inbound public keys and effective host configuration', async () => {
    const state = await desired(config());
    assert.equal(state.authorizedKeys, `${publicKey}\n`);
    assert.deepEqual(state.privateKeys, [
      { filename: 'service', source: path.join(directory, 'service') },
    ]);
    const filename = path.join(directory, 'client-config');
    await writeFile(filename, state.clientConfig);
    const effective = run('ssh', ['-G', '-F', filename, 'personal']);
    assert.match(effective, /^hostname github.com$/mu);
    assert.match(effective, /^user git$/mu);
    assert.match(effective, /^identitiesonly yes$/mu);
    assert.match(effective, /^identityfile ~\/.ssh\/codebox-keys\/service$/mu);
  });

  it('renders multiple authorizations and aliases while selecting each filename once', async () => {
    await writeFile(
      path.join(directory, 'second-device'),
      `${publicKey} second-device\n`,
    );
    const ssh = config();
    ssh['authorized-keys'].push('second-device');
    ssh.client.hosts.work = {
      hostname: 'work.example.com',
      user: 'developer',
      key: 'service',
    };
    const state = await desired(ssh);
    assert.equal(state.authorizedKeys, `${publicKey}\n${publicKey} second-device\n`);
    assert.equal(state.privateKeys.length, 1);
    assert.match(state.clientConfig, /^Host work$/mu);
    await symlink(path.join(directory, 'laptop'), path.join(directory, 'local-link'));
    assert.equal(
      (await desired({ 'authorized-keys': ['local-link'] })).authorizedKeys,
      `${publicKey}\n`,
    );
    await assert.rejects(desired({ 'authorized-keys': ['service.pub'] }), /cannot read/u);
  });

  it('accepts encrypted OpenSSH and PEM keys without companion files or prompting', async () => {
    for (const key of ['encrypted', 'pem', 'pkcs8', 'ed25519', 'gcm', 'chacha']) {
      const ssh = config();
      ssh.client.hosts.personal.key = key;
      assert.equal((await desired(ssh)).privateKeys[0].filename, key);
    }
  });

  it('replaces raw directives case-insensitively, including additive IdentityFile', async () => {
    const ssh = config();
    ssh.client.hosts.personal.raw = {
      hOsTnAmE: 'example.com',
      USER: 'developer',
      identityfile: '/tmp/override',
      IdentitiesOnly: 'no',
    };
    const { clientConfig } = await desired(ssh);
    assert.doesNotMatch(clientConfig, /github.com|codebox-keys| {2}User git/u);
    const filename = path.join(directory, 'override-config');
    await writeFile(filename, clientConfig);
    const effective = run('ssh', ['-G', '-F', filename, 'personal']);
    assert.match(effective, /^hostname example.com$/mu);
    assert.match(effective, /^user developer$/mu);
    assert.match(effective, /^identitiesonly no$/mu);
    assert.deepEqual(effective.match(/^identityfile .*$/gmu), [
      'identityfile /tmp/override',
    ]);
  });

  it('reports missing legacy configuration and empty authorization actionably', async () => {
    await assert.rejects(desired(undefined), /Legacy id_rsa.pub.*explicitly/u);
    await assert.rejects(desired({ env: ['TOKEN'] }), /ssh.authorized-keys/u);
    await assert.rejects(desired({ 'authorized-keys': [] }), /nonempty list/u);
  });

  it('preserves ssh.env and allows inbound-only configuration', async () => {
    const ssh = { 'authorized-keys': ['laptop'], env: ['TOKEN'] };
    const state = await desired(ssh);
    assert.equal(state.clientConfig, '');
    assert.deepEqual(state.privateKeys, []);
    assert.deepEqual(ssh.env, ['TOKEN']);
  });

  it('rejects unsafe filenames, missing files, symlink escape and role mismatches', async () => {
    for (const filename of [
      '../laptop',
      '/tmp/laptop',
      'nested/key',
      'a\\b',
      '-key',
      '',
      'missing',
      'escape',
      'service',
      'garbage',
    ]) {
      await assert.rejects(desired({ 'authorized-keys': [filename] }));
    }
    for (const key of ['laptop', 'garbage', '../service', 'missing', 'escape']) {
      const ssh = config();
      ssh.client.hosts.personal.key = key;
      await assert.rejects(desired(ssh));
    }
  });

  it('rejects malformed public siblings rather than accepting the first valid key', async () => {
    await writeFile(path.join(directory, 'mixed'), `${publicKey}\nnot a key\n`);
    await assert.rejects(desired({ 'authorized-keys': ['mixed'] }), /public-key lines/u);
    await writeFile(path.join(directory, 'empty'), '');
    await assert.rejects(desired({ 'authorized-keys': ['empty'] }));
    await writeFile(path.join(directory, 'bad-public'), 'ssh-rsa YWJj\n');
    await assert.rejects(
      desired({ 'authorized-keys': ['bad-public'] }),
      /invalid public key/u,
    );
  });

  it('rejects configuration type errors', async () => {
    for (const ssh of [
      null,
      [],
      'ssh',
      { 'authorized-keys': 'laptop' },
      { 'authorized-keys': [false] },
    ]) {
      await assert.rejects(desired(ssh));
    }
    for (const client of [
      null,
      [],
      true,
      { hosts: [] },
      { hosts: { personal: false } },
    ]) {
      await assert.rejects(desired({ 'authorized-keys': ['laptop'], client }));
    }
    for (const raw of [
      false,
      [],
      { Port: 22 },
      { Port: true },
      { Port: ['22'] },
      { Port: {} },
      { Port: null },
    ]) {
      const ssh = config();
      ssh.client.hosts.personal.raw = raw;
      await assert.rejects(desired(ssh));
    }
  });

  it('rejects directive injection and ambiguous raw names', async () => {
    for (const raw of [
      { User: 'git\nHost *' },
      { 'User\nHost': 'git' },
      { User: 'git', user: 'other' },
      { Host: '*' },
      { Match: 'all' },
      { Include: '/tmp/other-config' },
      { User: 'git\0' },
    ]) {
      const ssh = config();
      ssh.client.hosts.personal.raw = raw;
      await assert.rejects(desired(ssh));
    }
    for (const alias of ['*', '!personal', 'one two', 'one\nHost *']) {
      const ssh = config();
      ssh.client.hosts = { [alias]: ssh.client.hosts.personal };
      await assert.rejects(desired(ssh));
    }
    for (const hostname of [
      'example.com\nHost *',
      'example.com User root',
      '"example.com"',
    ]) {
      const ssh = config();
      ssh.client.hosts.personal.hostname = hostname;
      await assert.rejects(desired(ssh));
    }
  });

  it('rejects truncated encrypted containers', async () => {
    const contents = await readFile(path.join(directory, 'encrypted'), 'utf8');
    const armorFooterLines = 2;
    const truncatedLength = 64;
    const encoded = contents.split('\n').slice(1, -armorFooterLines).join('');
    const truncated = Buffer.from(encoded, 'base64')
      .subarray(0, truncatedLength)
      .toString('base64');
    await writeFile(
      path.join(directory, 'truncated'),
      `-----BEGIN OPENSSH PRIVATE KEY-----\n${truncated}\n-----END OPENSSH PRIVATE KEY-----\n`,
    );
    const ssh = config();
    ssh.client.hosts.personal.key = 'truncated';
    await assert.rejects(desired(ssh), /valid private key/u);
  });
});
