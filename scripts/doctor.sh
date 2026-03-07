#!/usr/bin/env bash
set -euo pipefail

cd /root/tradejournal-mvp

echo "=== TradeJournal MVP Doctor ==="
echo "time_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo
if [[ -x scripts/preflight.sh ]]; then
  echo "[preflight]"
  ./scripts/preflight.sh
else
  echo "[preflight] missing scripts/preflight.sh"
  exit 1
fi

echo
echo "[dataset]"
TRADES=$(jq '.trades|length' data/trades.json)
JOURNAL=$(jq '.entries|length' data/journal.json)
UIJ=$(jq '.journal|length' data/trades.json)
echo "trades_count=$TRADES"
echo "journal_entries=$JOURNAL"
echo "ui_journal_count=$UIJ"

echo
echo "[anomalies]"
DUP_IDS=$(jq -r '.trades | map(.id) | group_by(.) | map(select(length>1) | .[0]) | .[]?' data/trades.json || true)
if [[ -n "${DUP_IDS:-}" ]]; then
  echo "duplicate_trade_ids:"
  echo "$DUP_IDS"
else
  echo "duplicate_trade_ids: none"
fi

FUTURE_TRADES=$(jq --arg today "$(date +%F)" '[.trades[] | select(.date > $today)] | length' data/trades.json)
echo "future_dated_trades=$FUTURE_TRADES"

echo
echo "[recent_commits]"
git --no-pager log --oneline -n 5

echo
echo "doctor_status=OK"
