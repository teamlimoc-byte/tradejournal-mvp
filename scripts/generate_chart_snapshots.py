#!/usr/bin/env python3
import json
import subprocess
import time
import sys
import urllib.parse
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRADES_PATH = ROOT / 'data' / 'trades.json'
OUT_DIR = ROOT / 'data' / 'chart-cache'
USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'


def sanitize_symbol(value: str) -> str:
    return ''.join(ch if ch.isalnum() or ch in {'-', '_'} else '_' for ch in (value or ''))


def chart_symbol_for_trade(trade: dict) -> str:
    asset_type = str(trade.get('assetType') or '').lower()
    raw_symbol = str(trade.get('symbol') or '').strip().upper()
    underlying = str(trade.get('underlying') or '').strip().upper()
    root = (underlying or raw_symbol.split(' ')[0] or raw_symbol).strip()

    if asset_type == 'options' and underlying:
        return underlying
    if root.startswith('MNQ'):
        return 'MNQ=F'
    if root.startswith('NQ'):
        return 'NQ=F'
    if root.startswith('MES'):
        return 'MES=F'
    if root.startswith('ES'):
        return 'ES=F'
    if root.startswith('M2K') or root.startswith('RTY'):
        return 'RTY=F'
    if root.startswith('MGC') or root.startswith('GC'):
        return 'GC=F'
    if root.startswith('MCL') or root.startswith('CL'):
        return 'CL=F'
    return root


def fetch_range_snapshot(chart_symbol: str, start_date: str, end_date: str, interval: str = '5m') -> dict:
    day_start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    day_end = datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc) + timedelta(days=1)
    params = urllib.parse.urlencode({
        'period1': int(day_start.timestamp()),
        'period2': int(day_end.timestamp()),
        'interval': interval,
        'includePrePost': 'true',
        'events': 'div,splits,capitalGains'
    })
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{chart_symbol}?{params}"
    payload = None
    for attempt in range(4):
        try:
            result = subprocess.run(
                ['curl', '-L', '-A', USER_AGENT, '--max-time', '30', '--silent', '--show-error', url],
                text=True,
                capture_output=True,
                check=True,
            )
            body = result.stdout.strip()
            if not body or not body.startswith('{'):
                raise RuntimeError(f'Unexpected Yahoo response for {chart_symbol}: {result.stderr[:200]} {body[:200]}')
            payload = json.loads(body)
            break
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
    if payload is None:
        raise RuntimeError(f'No response for {chart_symbol} {start_date}..{end_date}')

    chart = payload.get('chart', {})
    if chart.get('error'):
        raise RuntimeError(chart['error'])
    result = (chart.get('result') or [None])[0]
    if not result:
        raise RuntimeError(f'No chart result for {chart_symbol} {start_date}..{end_date}')

    timestamps = result.get('timestamp') or []
    quote = ((result.get('indicators') or {}).get('quote') or [{}])[0]
    opens = quote.get('open') or []
    highs = quote.get('high') or []
    lows = quote.get('low') or []
    closes = quote.get('close') or []
    volumes = quote.get('volume') or []

    bars = []
    for idx, ts in enumerate(timestamps):
        try:
            o = opens[idx]
            h = highs[idx]
            l = lows[idx]
            c = closes[idx]
        except IndexError:
            continue
        if None in (o, h, l, c):
            continue
        bars.append({
            'time': int(ts),
            'open': float(o),
            'high': float(h),
            'low': float(l),
            'close': float(c),
            'volume': float(volumes[idx]) if idx < len(volumes) and volumes[idx] is not None else 0,
        })

    return {
        'startDate': start_date,
        'endDate': end_date,
        'chartSymbol': chart_symbol,
        'interval': interval,
        'source': 'yahoo-chart-api',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'meta': result.get('meta') or {},
        'bars': bars,
    }


def load_trades() -> list:
    payload = json.loads(TRADES_PATH.read_text())
    return list(payload.get('trades') or [])


def main() -> int:
    trades = load_trades()
    requested_dates = set(sys.argv[1:])
    grouped = defaultdict(list)
    for trade in trades:
        trade_date = str(trade.get('date') or '').strip()
        if not trade_date:
            continue
        if requested_dates and trade_date not in requested_dates:
            continue
        chart_symbol = chart_symbol_for_trade(trade)
        if not chart_symbol:
            continue
        grouped[(trade_date, chart_symbol)].append(trade)

    if not grouped:
        print('No trade dates matched.')
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    grouped_by_symbol = defaultdict(dict)
    for (trade_date, chart_symbol), day_trades in grouped.items():
        grouped_by_symbol[chart_symbol][trade_date] = day_trades

    for chart_symbol, by_date in sorted(grouped_by_symbol.items()):
        dates = sorted(by_date)
        snapshot = fetch_range_snapshot(chart_symbol, dates[0], dates[-1])
        bars = snapshot['bars']
        bars_by_date = defaultdict(list)
        for bar in bars:
            bar_date = datetime.fromtimestamp(bar['time'], tz=timezone.utc).date().isoformat()
            bars_by_date[bar_date].append(bar)

        for trade_date in dates:
            day_trades = by_date[trade_date]
            day_snapshot = {
                'date': trade_date,
                'chartSymbol': chart_symbol,
                'interval': snapshot['interval'],
                'source': snapshot['source'],
                'generatedAt': snapshot['generatedAt'],
                'meta': snapshot['meta'],
                'bars': bars_by_date.get(trade_date, []),
                'tradeCount': len(day_trades),
                'tradeIds': [t.get('id') for t in day_trades if t.get('id')],
                'symbols': sorted({str(t.get('symbol') or '').upper() for t in day_trades if t.get('symbol')}),
            }
            out_path = OUT_DIR / f"{trade_date}--{sanitize_symbol(chart_symbol)}.json"
            out_path.write_text(json.dumps(day_snapshot, indent=2) + '\n')
            print(f'Wrote {out_path.relative_to(ROOT)} ({len(day_snapshot["bars"])} bars)')
        time.sleep(1)

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
