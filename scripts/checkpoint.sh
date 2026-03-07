#!/usr/bin/env bash
set -euo pipefail

cd /root/tradejournal-mvp

MSG="${*:-checkpoint: $(date -u +"%Y-%m-%d %H:%M UTC")}" 

# preflight gate
if [[ -x scripts/preflight.sh ]]; then
  ./scripts/preflight.sh
fi

# show status first
echo "== git status =="
git status --short || true
echo

# add all tracked + new files
git add -A

# no-op if nothing changed
if git diff --cached --quiet; then
  echo "No changes to commit."
  exit 0
fi

git commit -m "$MSG"
git push origin main

echo
echo "✅ Checkpoint pushed: $MSG"
