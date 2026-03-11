#!/bin/sh
set -eu

DATA_DIR="${TRADER_DATA_DIR:-/data}"

if [ ! -d "$DATA_DIR" ]; then
  mkdir -p "$DATA_DIR"
fi

# Railway mounts can override image-time ownership. Fix at runtime when possible.
if [ "$(id -u)" = "0" ]; then
  chown -R trader:trader "$DATA_DIR" 2>/dev/null || true
  chmod u+rwx "$DATA_DIR" 2>/dev/null || true
  if su-exec trader sh -c "test -w \"$DATA_DIR\""; then
    exec su-exec trader "$@"
  fi
  echo "[entrypoint] warning: $DATA_DIR is not writable as 'trader'; starting as root" >&2
  exec "$@"
fi

exec "$@"
