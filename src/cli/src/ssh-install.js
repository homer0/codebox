import {
  chmod,
  chown,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getConfig, getPath } from './fns.js';
import { ensureSshAgent } from './ssh-agent.js';
import { getDesiredSshState, validatePrivateKey } from './ssh.js';

const SSH_DIRECTORY_MODE = 0o700;
const SSH_FILE_MODE = 0o600;

/** Set exact access and ownership, including filesystems that inherit a parent group. */
const setAccess = async (filename, mode) => {
  const { uid, gid } = os.userInfo();
  await chown(filename, uid, gid);
  await chmod(filename, mode);
};

/** Return absent entries without hiding permission or other filesystem failures. */
const getEntry = async (filename) => {
  try {
    return await lstat(filename);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
};

/** Refuse unexpected managed destinations rather than following directory symlinks. */
const checkDestinations = async (sshDirectory) => {
  const directory = await getEntry(sshDirectory);
  if (directory && (!directory.isDirectory() || directory.uid !== os.userInfo().uid)) {
    throw new Error(
      'The SSH directory must be a real directory owned by the runtime user',
    );
  }
  for (const name of ['authorized_keys', 'config', 'id_rsa', 'id_rsa.pub']) {
    const entry = await getEntry(path.join(sshDirectory, name));
    if (entry && !entry.isFile() && !entry.isSymbolicLink()) {
      throw new Error(`Cannot replace SSH file ${name}: unexpected destination type`);
    }
  }
  const keys = await getEntry(path.join(sshDirectory, 'codebox-keys'));
  if (keys && !keys.isDirectory()) {
    throw new Error('codebox-keys must be a real managed directory, not a symlink');
  }
};

/**
 * Stage validated files and sequentially replace only codebox-managed SSH state. The
 * caller must keep the SSH service stopped until installation succeeds. Failures are not
 * rolled back to revoked authorization; the next setup reconciles again.
 *
 * @param {object} options Explicit SSH configuration, source directory, and SSH
 *   destination.
 */
export const installSshState = async (options) => {
  const { ssh, sourceDirectory, sshDirectory } = options;
  const desired = await getDesiredSshState({ ssh, sourceDirectory });
  await checkDestinations(sshDirectory);
  await mkdir(sshDirectory, { recursive: true, mode: SSH_DIRECTORY_MODE });
  await setAccess(sshDirectory, SSH_DIRECTORY_MODE);
  const staging = await mkdtemp(path.join(sshDirectory, '.codebox-stage-'));
  try {
    await setAccess(staging, SSH_DIRECTORY_MODE);
    const stagedKeys = path.join(staging, 'codebox-keys');
    await mkdir(stagedKeys, { mode: SSH_DIRECTORY_MODE });
    await setAccess(stagedKeys, SSH_DIRECTORY_MODE);
    for (const file of desired.privateKeys) {
      const contents = await readFile(file.source, 'utf8');
      // Validate the exact snapshot being installed, not a later copy of earlier input.
      await validatePrivateKey({ ...file, contents }, `ssh private key ${file.filename}`);
      const stagedKey = path.join(stagedKeys, file.filename);
      await writeFile(stagedKey, contents, { mode: SSH_FILE_MODE });
      await setAccess(stagedKey, SSH_FILE_MODE);
    }
    await writeFile(path.join(staging, 'authorized_keys'), desired.authorizedKeys, {
      mode: SSH_FILE_MODE,
    });
    await writeFile(path.join(staging, 'config'), desired.clientConfig, {
      mode: SSH_FILE_MODE,
    });

    for (const name of ['authorized_keys', 'config']) {
      await setAccess(path.join(staging, name), SSH_FILE_MODE);
    }

    /**
     * All source bytes are validated before any managed destination is replaced. These
     * renames are sequential, not a cross-file filesystem transaction.
     */
    const installedKeys = path.join(sshDirectory, 'codebox-keys');
    if (await getEntry(installedKeys)) {
      await rename(installedKeys, path.join(staging, 'previous-keys'));
    }
    await rename(stagedKeys, installedKeys);
    await rename(path.join(staging, 'config'), path.join(sshDirectory, 'config'));
    await rename(
      path.join(staging, 'authorized_keys'),
      path.join(sshDirectory, 'authorized_keys'),
    );
    for (const name of ['id_rsa', 'id_rsa.pub']) {
      await rm(path.join(sshDirectory, name), { force: true });
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
};

/** Install configured SSH state as coder, never as root or into another user's home. */
export const installConfiguredSsh = async () => {
  const user = os.userInfo();
  if (user.username !== 'coder')
    throw new Error('SSH setup must run as coder, not through sudo');
  const config = await getConfig();
  await installSshState({
    ssh: config.ssh,
    sourceDirectory: getPath('ssh-keys'),
    sshDirectory: path.join(user.homedir, '.ssh'),
  });
  await ensureSshAgent();
};
