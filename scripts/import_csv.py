#!/usr/bin/env python3
import argparse
import csv
import json
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / 'data' / 'trades.json'
CHART_SCRIPT = ROOT / 'scripts' / 'generate_chart_snapshots.py'


def pnl_to_num(value: str) -> float:
    s = str(value or '').strip().replace('$', '').replace(',', '')
    if s.startswith('(') and s.endswith(')'):
        return -float(s[1:-1])
    return float(s or 0)


def load_db() -> dict:
    if JSON_PATH.exists():
        return json.loads(JSON_PATH.read_text())
    return {'source': 'canonical', 'generatedAt': '', 'trades': [], 'journal': []}


def save_db(db: dict) -> None:
    db['generatedAt'] = datetime.utcnow().isoformat() + 'Z'
    JSON_PATH.write_text(json.dumps(db, indent=2) + '\n')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Import performance CSV into trades.json')
    parser.add_argument('csv_path', help='Path to the exported performance CSV')
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    csv_path = Path(args.csv_path).expanduser().resolve()
    if not csv_path.exists():
        raise SystemExit(f'CSV not found: {csv_path}')

    db = load_db()
    trades = db.get('trades', [])
    existing_fill_ids = {str(t.get('buyFillId', '')).strip() for t in trades if t.get('buyFillId')}

    with csv_path.open(newline='', encoding='utf-8') as handle:
        rows = list(csv.DictReader(handle))

    added = 0
    affected_dates = set()
    for row in rows:
        buy_fill = str(row.get('buyFillId', '')).strip()
        if buy_fill and buy_fill in existing_fill_ids:
            continue

        bought_ts = row['boughtTimestamp']
        sold_ts = row['soldTimestamp']
        dt = datetime.strptime(bought_ts, '%m/%d/%Y %H:%M:%S')
        trade_date = dt.strftime('%Y-%m-%d')
        pnl = pnl_to_num(row.get('pnl', '0'))
        buy_price = float(row['buyPrice'])
        sell_price = float(row['sellPrice'])
        side = 'Long' if sell_price >= buy_price else 'Short'
        trade_id = f"CSV-{trade_date.replace('-', '')}-{buy_fill or added}"

        trades.append({
            'id': trade_id,
            'date': trade_date,
            'symbol': row['symbol'],
            'side': side,
            'setup': 'CSV Import',
            'qty': int(float(row['qty'])),
            'entry': buy_price,
            'exit': sell_price,
            'buyPrice': buy_price,
            'sellPrice': sell_price,
            'pnl': pnl,
            'commission': 1,
            'r': 0,
            'tags': [],
            'notes': row.get('duration', ''),
            'buyFillId': row.get('buyFillId', ''),
            'sellFillId': row.get('sellFillId', ''),
            'boughtTimestamp': bought_ts,
            'soldTimestamp': sold_ts,
            'entryTimestamp': bought_ts,
            'exitTimestamp': sold_ts,
            'source': 'csv-manual-import'
        })
        if buy_fill:
            existing_fill_ids.add(buy_fill)
        added += 1
        affected_dates.add(trade_date)

    db['trades'] = trades
    save_db(db)
    print(f'Added {added} new trades.')

    if affected_dates:
        try:
            subprocess.run(
                ['python3', str(CHART_SCRIPT), *sorted(affected_dates)],
                cwd=str(ROOT),
                check=True,
            )
        except subprocess.CalledProcessError as exc:
            print(f'warning: chart snapshot generation failed: {exc}')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
