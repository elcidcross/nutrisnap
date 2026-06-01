#!/usr/bin/env bash
# Container entrypoint for the agent image. If AGENT_FIREWALL=1 and we have the
# privileges to do it, lock egress down to the allowlist before handing control
# to the requested command. Firewall failures are non-fatal (we warn and run
# with open network) so a missing capability never blocks the agent.
set -euo pipefail

if [ "${AGENT_FIREWALL:-0}" = "1" ]; then
  if [ "$(id -u)" = "0" ]; then
    if /usr/local/bin/agent-firewall.sh; then
      # Drop back to the unprivileged user so files written to the mounted repo
      # keep the right ownership.
      exec setpriv --reuid=node --regid=node --init-groups "$@"
    else
      echo "[agent] WARNING: firewall setup failed; continuing with open network" >&2
      exec setpriv --reuid=node --regid=node --init-groups "$@"
    fi
  else
    echo "[agent] WARNING: AGENT_FIREWALL=1 but not running as root (need --user root --cap-add NET_ADMIN); continuing with open network" >&2
  fi
fi

exec "$@"
