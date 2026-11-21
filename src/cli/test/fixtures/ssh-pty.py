"""Drive disposable OpenSSH terminal prompts without printing terminal contents or secrets."""

import errno
import json
import os
import pty
import re
import select
import signal
import sys
import time

request = json.load(sys.stdin)
pid, terminal = pty.fork()
if pid == 0:
    os.execvpe(request["args"][0], request["args"], {**os.environ, **request.get("env", {})})

answers = iter(request.get("answers", []))
prompts = 0
transcript = b""
pending = b""
status = None
deadline = time.monotonic() + 20
try:
    while time.monotonic() < deadline:
        if select.select([terminal], [], [], 0.1)[0]:
            try:
                chunk = os.read(terminal, 65536)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                break
            if not chunk:
                break
            transcript += chunk
            pending += chunk
            if re.search(rb"(?i)passphrase[^\r\n]*: ?$", pending):
                prompts += 1
                answer = next(answers, None)
                if answer is None:
                    os.kill(pid, signal.SIGKILL)
                    break
                if isinstance(answer, dict) and answer.get("signal") == "INT":
                    os.write(terminal, b"\x03")
                else:
                    os.write(terminal, answer.encode() + b"\n")
                pending = b""
        done, status = os.waitpid(pid, os.WNOHANG)
        if done:
            break
    else:
        os.kill(pid, signal.SIGKILL)
finally:
    os.close(terminal)
    try:
        _, status = os.waitpid(pid, 0)
    except ChildProcessError:
        pass

summary = re.search(rb"SSH keys: (\d+) loaded, (\d+) already loaded, (\d+) failed", transcript)
print(json.dumps({
    "status": os.waitstatus_to_exitcode(status),
    "prompts": prompts,
    "summary": [int(value) for value in summary.groups()] if summary else None,
    "cancelled": b"cancelled" in transcript,
}))
