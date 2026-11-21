#!/bin/sh

set -eu
umask 077

HOST_KEY_DIRECTORY=/var/lib/codebox/ssh-host-keys

fail() {
  printf 'SSH host identity: %s\n' "$1" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail 'setup must run as root'
[ -d "$HOST_KEY_DIRECTORY" ] && [ ! -L "$HOST_KEY_DIRECTORY" ] \
  || fail 'storage must be a real directory'
mountpoint -q "$HOST_KEY_DIRECTORY" \
  || fail 'mount a dedicated writable host-key volume at /var/lib/codebox/ssh-host-keys'
chown root:root "$HOST_KEY_DIRECTORY" && chmod 0700 "$HOST_KEY_DIRECTORY" \
  || fail 'cannot protect host-key storage; check that the mount is writable'

# Kernel locks release on process exit, including crashes; no stale lock deletion is needed.
[ ! -L "$HOST_KEY_DIRECTORY/.setup.lock" ] || fail 'lock path must not be a symlink'
if [ -e "$HOST_KEY_DIRECTORY/.setup.lock" ] && [ ! -f "$HOST_KEY_DIRECTORY/.setup.lock" ]; then
  fail 'lock path must be a regular file'
fi
exec 9>>"$HOST_KEY_DIRECTORY/.setup.lock"
flock -n 9 || fail 'another host-key setup is active; retry after it finishes'
STAGING=$(mktemp -d "$HOST_KEY_DIRECTORY/.host-key-stage.XXXXXX") \
  || fail 'host-key storage is not writable'
cleanup() {
  rm -f "$STAGING/key" "$STAGING/key.pub" \
    "$STAGING/ed25519.pub" "$STAGING/ecdsa.pub" "$STAGING/rsa.pub"
  rmdir "$STAGING"
}
trap cleanup 0
trap 'exit 1' HUP INT TERM

# Validate all existing private keys before generating any missing identity.
for TYPE in ed25519 ecdsa rsa; do
  PRIVATE="$HOST_KEY_DIRECTORY/ssh_host_${TYPE}_key"
  PUBLIC="$PRIVATE.pub"
  [ ! -L "$PRIVATE" ] && [ ! -L "$PUBLIC" ] || fail "refusing symlinked key: $PRIVATE"
  if [ -e "$PUBLIC" ] && [ ! -f "$PUBLIC" ]; then
    fail "public-key path is not a regular file: $PUBLIC"
  fi
  if [ -e "$PRIVATE" ]; then
    [ -f "$PRIVATE" ] || fail "private-key path is not a regular file: $PRIVATE"
    chown root:root "$PRIVATE" && chmod 0600 "$PRIVATE" || fail "cannot protect $PRIVATE"
    DERIVED=$(ssh-keygen -y -P '' -f "$PRIVATE") \
      || fail "invalid or encrypted private host key: $PRIVATE; restore a valid backup, do not silently rotate it"
    case "$TYPE:$DERIVED" in
      ed25519:ssh-ed25519\ *|ecdsa:ecdsa-sha2-nistp256\ *|rsa:ssh-rsa\ *) ;;
      *) fail "unexpected private-key type: $PRIVATE" ;;
    esac
    printf '%s\n' "$DERIVED" > "$STAGING/$TYPE.pub"
  fi
done

for TYPE in ed25519 ecdsa rsa; do
  PRIVATE="$HOST_KEY_DIRECTORY/ssh_host_${TYPE}_key"
  if [ ! -f "$PRIVATE" ]; then
    ssh-keygen -q -t "$TYPE" -N '' -f "$STAGING/key" \
      || fail "cannot generate missing $TYPE host key"
    chown root:root "$STAGING/key" && chmod 0600 "$STAGING/key" \
      || fail 'cannot protect generated private key'
    mv "$STAGING/key" "$PRIVATE"
    mv "$STAGING/key.pub" "$STAGING/$TYPE.pub"
  fi
  chown root:root "$STAGING/$TYPE.pub" && chmod 0644 "$STAGING/$TYPE.pub" \
    || fail 'cannot protect derived public key'
  mv "$STAGING/$TYPE.pub" "$PRIVATE.pub"
done
