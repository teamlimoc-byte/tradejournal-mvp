#!/usr/bin/env bash
set -euo pipefail

TFILE="data/trades.json"
JFILE="data/journal.json"

[[ -f "$TFILE" ]] || { echo "Missing $TFILE"; exit 1; }
[[ -f "$JFILE" ]] || { echo "Missing $JFILE"; exit 1; }

# JSON parse checks
jq -e '.' "$TFILE" >/dev/null
jq -e '.' "$JFILE" >/dev/null

# Required top-level arrays
jq -e '.trades | type == "array"' "$TFILE" >/dev/null || { echo "trades.json: .trades must be array"; exit 1; }
jq -e '.entries | type == "array"' "$JFILE" >/dev/null || { echo "journal.json: .entries must be array"; exit 1; }

# Duplicate trade IDs
DUP_IDS=$(jq -r '.trades | map(.id) | group_by(.) | map(select(length>1) | .[0]) | .[]?' "$TFILE" || true)
if [[ -n "${DUP_IDS:-}" ]]; then
  echo "Duplicate trade IDs found:"
  echo "$DUP_IDS"
  exit 1
fi

# Basic trade field checks
BAD_TRADE_COUNT=$(jq '[.trades[] | select((.id|not) or (.date|not) or (.symbol|not) or (.side|not))] | length' "$TFILE")
if [[ "$BAD_TRADE_COUNT" -gt 0 ]]; then
  echo "trades.json: $BAD_TRADE_COUNT trade(s) missing required fields (id/date/symbol/side)"
  exit 1
fi

# Trade date format checks
BAD_TRADE_DATE=$(jq '[.trades[] | select((.date|type)!="string" or (.date|test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$")|not))] | length' "$TFILE")
if [[ "$BAD_TRADE_DATE" -gt 0 ]]; then
  echo "trades.json: $BAD_TRADE_DATE trade(s) with invalid date format"
  exit 1
fi

# Journal date format checks
BAD_JOURNAL_DATE=$(jq '[.entries[] | select((.date|not) or (.date|type)!="string" or (.date|test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$")|not))] | length' "$JFILE")
if [[ "$BAD_JOURNAL_DATE" -gt 0 ]]; then
  echo "journal.json: $BAD_JOURNAL_DATE entries with invalid/missing date"
  exit 1
fi

echo "preflight: OK"
