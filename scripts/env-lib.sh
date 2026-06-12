# Shared env-file loading for the dev and agent boxes.
#
# `.env.local` quotes its values (KEY="https://…") so the file works with bash
# `source` and dotenv (both strip the surrounding quotes). podman's
# `--env-file`, however, keeps the quotes *literally*, so the container would
# receive `"https://…"` — quotes included — which crashes the app on boot with
# `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL` and leaves a blank
# page. (`SPEC.md`/CLAUDE.md already document `.env.local` as "sourced before
# vercel dev", i.e. the source-style, quote-stripping semantics are intended.)
#
# So instead of pointing podman at the raw file, we `source` it here (bash
# strips the quotes exactly as vercel dev does) and pass each key through as
# `-e KEY=value` with the now-clean value. Only keys declared in the files are
# forwarded, so the agent box's isolation is unchanged.
#
# Usage: source this file, init `ENV_ARGS=()`, then `load_env_args <file>…`.
# Must be *called* in the launcher's shell (not `$( … )`) so the sourced
# exports survive for the indirect expansion below.
load_env_args() {
  local f line key
  for f in "$@"; do
    [ -f "$f" ] || continue
    set -a; . "$f"; set +a
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in
        [A-Za-z_]*=*) key="${line%%=*}"; ENV_ARGS+=(-e "$key=${!key:-}") ;;
      esac
    done < "$f"
  done
}
