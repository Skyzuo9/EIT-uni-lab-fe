#!/bin/sh

set -eu

config_file="${UNILAB_CONFIG_FILE:-/etc/unilab/workbench.env}"
if [ ! -r "$config_file" ]; then
  echo "UniLab Workbench config is not readable: $config_file" >&2
  exit 78
fi

# The file is installed root:unilab with mode 0640 and uses portable KEY=value
# assignments so the dedicated service account can read the shared contract.
set -a
. "$config_file"
set +a

: "${UNILAB_NODE:?UNILAB_NODE is required}"
: "${UNILAB_WORKBENCH_ROOT:?UNILAB_WORKBENCH_ROOT is required}"
: "${THEIA_WORKSPACE:?THEIA_WORKSPACE is required}"
: "${UNILAB_PYTHON_ENV:?UNILAB_PYTHON_ENV is required}"
: "${UNILAB_REMOTE_ACCESS_URL_FILE:?UNILAB_REMOTE_ACCESS_URL_FILE is required}"

runtime_directory=$(dirname "$UNILAB_REMOTE_ACCESS_URL_FILE")
mkdir -p "$runtime_directory"
chmod 0700 "$runtime_directory"

exec "$UNILAB_NODE" \
  "$UNILAB_WORKBENCH_ROOT/apps/workbench/scripts/start-workbench.mjs" \
  --remote
