import { execFile } from 'node:child_process';
import { chmod, lstat, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const AGENT_TOOL_TIMEOUT = 5000;
const AGENT_UNAVAILABLE_STATUS = 2;
const AGENT_START_ATTEMPTS = 40;
const AGENT_POLL_DELAY = 50;
const AGENT_DIRECTORY_MODE = 0o700;
const AGENT_FILE_MODE = 0o600;

/** Fixed container paths are shared through Docker ENV and the SSH daemon environment. */
export const SSH_AGENT_DIRECTORY = '/home/coder/.codebox/ssh-agent';
export const SSH_AGENT_SOCKET = `${SSH_AGENT_DIRECTORY}/agent.sock`;

/** Override forwarded or user-selected agents when operating on the managed agent. */
export const getAgentEnvironment = (socket) => ({
  // oxlint-disable-next-line node/no-process-env -- preserve the command environment without askpass
  ...process.env,
  SSH_AUTH_SOCK: socket,
  SSH_ASKPASS_REQUIRE: 'never',
  LC_ALL: 'C',
});

/** Distinguish a reachable empty agent from an unavailable socket. */
export const getAgentFingerprints = async (socket) => {
  try {
    const { stdout } = await runFile('/usr/bin/ssh-add', ['-l', '-E', 'sha256'], {
      env: getAgentEnvironment(socket),
      timeout: AGENT_TOOL_TIMEOUT,
    });
    return stdout
      .trim()
      .split('\n')
      .map((line) => line.split(/\s/u)[1]);
  } catch (error) {
    if (error.code === 1) return [];
    if (error.code === AGENT_UNAVAILABLE_STATUS || error.killed) return undefined;
    throw new Error('Unable to inspect the shared SSH agent with ssh-add');
  }
};

/** Do not follow socket, metadata, or runtime-directory symlinks. */
const getOwnedEntry = async (filename) => {
  try {
    const entry = await lstat(filename);
    if (entry.isSymbolicLink() || entry.uid !== os.userInfo().uid) {
      throw new Error(`Unsafe SSH agent runtime entry: ${filename}`);
    }
    return entry;
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
};

/** Identify only our exact managed agent before sending a termination signal. */
const isManagedProcess = async (pid, socket) => {
  try {
    const { stdout } = await runFile('/bin/ps', ['-p', String(pid), '-o', 'args='], {
      timeout: AGENT_TOOL_TIMEOUT,
    });
    const command = stdout.trim();
    return (
      command === `/usr/bin/ssh-agent -s -a ${socket}` ||
      command === `ssh-agent -s -a ${socket}`
    );
  } catch (error) {
    if (error.code === 1) return false;
    throw new Error('Unable to identify the previous managed SSH agent');
  }
};

/**
 * Stop a recorded managed process whose socket no longer works, without trusting a reused
 * PID.
 */
const stopStaleAgent = async (options) => {
  const { pidFile, socket } = options;
  if (!(await getOwnedEntry(pidFile))) return;
  const value = (await readFile(pidFile, 'utf8')).trim();
  if (!/^[1-9][0-9]*$/u.test(value))
    throw new Error('Invalid managed SSH agent PID file; inspect the runtime directory');
  const pid = Number(value);
  if (!(await isManagedProcess(pid, socket))) return;
  process.kill(pid, 'SIGTERM');
  for (let attempt = 0; attempt < AGENT_START_ATTEMPTS; attempt += 1) {
    if (!(await isManagedProcess(pid, socket))) return;
    await setTimeout(AGENT_POLL_DELAY);
  }
  throw new Error(
    'Previous managed SSH agent did not stop; refusing to start a duplicate',
  );
};

/**
 * Reuse a responding agent or replace a verified stale managed instance, without
 * unlocking keys. An exclusive setup lock prevents concurrent starts; a crash-left lock
 * requires explicit inspection.
 */
export const ensureSshAgent = async (options = {}) => {
  const { runtimeDirectory = SSH_AGENT_DIRECTORY } = options;
  const directory = await getOwnedEntry(runtimeDirectory);
  if (directory && !directory.isDirectory())
    throw new Error('SSH agent runtime path must be a directory');
  await mkdir(runtimeDirectory, { recursive: true, mode: AGENT_DIRECTORY_MODE });
  await chmod(runtimeDirectory, AGENT_DIRECTORY_MODE);
  const socket = path.join(runtimeDirectory, 'agent.sock');
  const pidFile = path.join(runtimeDirectory, 'agent.pid');
  const lockFile = path.join(runtimeDirectory, 'setup.lock');
  let lock;
  try {
    lock = await open(lockFile, 'wx', AGENT_FILE_MODE);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        'SSH agent setup is locked; check for another setup process before removing setup.lock',
      );
    throw error;
  }
  try {
    const socketEntry = await getOwnedEntry(socket);
    if (socketEntry && !socketEntry.isSocket())
      throw new Error('SSH agent socket path contains a non-socket file');
    if (typeof (await getAgentFingerprints(socket)) !== 'undefined') return socket;
    await stopStaleAgent({ pidFile, socket });
    await rm(socket, { force: true });
    const { stdout } = await runFile('/usr/bin/ssh-agent', ['-s', '-a', socket], {
      timeout: AGENT_TOOL_TIMEOUT,
    });
    const match = stdout.match(/SSH_AGENT_PID=([1-9][0-9]*);/u);
    if (!match) throw new Error('SSH agent did not report a managed PID');
    const pid = Number(match[1]);
    try {
      await writeFile(pidFile, `${pid}\n`, { mode: AGENT_FILE_MODE });
      await chmod(pidFile, AGENT_FILE_MODE);
      for (let attempt = 0; attempt < AGENT_START_ATTEMPTS; attempt += 1) {
        if (typeof (await getAgentFingerprints(socket)) !== 'undefined') return socket;
        await setTimeout(AGENT_POLL_DELAY);
      }
      throw new Error('New shared SSH agent did not become reachable');
    } catch (error) {
      if (await isManagedProcess(pid, socket)) process.kill(pid, 'SIGTERM');
      throw error;
    }
  } finally {
    await lock.close();
    await rm(lockFile, { force: true });
  }
};
