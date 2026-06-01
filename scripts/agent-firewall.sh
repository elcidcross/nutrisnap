#!/usr/bin/env bash
# Opt-in egress allowlist for the agent container (AGENT_FIREWALL=1).
# Default-drop outbound traffic; permit only loopback, DNS, established flows,
# and the hosts the agent legitimately needs. Requires NET_ADMIN (+ NET_RAW) and
# to be run as root inside the container's own network namespace.
set -euo pipefail

ALLOW_DOMAINS=(
  # AI providers (the only AI path — see api/claude.js)
  api.anthropic.com
  api.openai.com
  generativelanguage.googleapis.com
  # Vercel (deploys, logs API)
  api.vercel.com vercel.com
  # GitHub (gh, git over https)
  github.com api.github.com codeload.github.com objects.githubusercontent.com
  # npm registry
  registry.npmjs.org
)

# Derive the Supabase host(s) from the project env so we don't hard-code them.
# tr -d '"' because podman --env-file keeps the surrounding quotes from .env.local.
host_of() { printf '%s' "$1" | tr -d '"' | sed -E 's#https?://([^/]+).*#\1#'; }
[ -n "${SUPABASE_URL:-}" ]            && ALLOW_DOMAINS+=("$(host_of "$SUPABASE_URL")")
[ -n "${REACT_APP_SUPABASE_URL:-}" ]  && ALLOW_DOMAINS+=("$(host_of "$REACT_APP_SUPABASE_URL")")

ipset create agent_allow hash:ip 2>/dev/null || ipset flush agent_allow
for d in "${ALLOW_DOMAINS[@]}"; do
  [ -n "$d" ] || continue
  for ip in $(getent ahostsv4 "$d" 2>/dev/null | awk '{print $1}' | sort -u); do
    ipset add agent_allow "$ip" 2>/dev/null || true
  done
done

# Egress policy. INPUT is left alone so the host can still reach :3000.
iptables -F OUTPUT
iptables -P OUTPUT DROP
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT
iptables -A OUTPUT -m set --match-set agent_allow dst -j ACCEPT
iptables -A OUTPUT -j REJECT --reject-with icmp-port-unreachable

echo "[agent-firewall] egress restricted to: ${ALLOW_DOMAINS[*]}"
