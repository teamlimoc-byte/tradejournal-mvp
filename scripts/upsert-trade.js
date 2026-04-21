#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const fp = path.resolve(__dirname, '..', 'data', 'trades.json');
const repoRoot = path.resolve(__dirname, '..');
const input = process.argv[2];
if (!input) {
console.error('Usage: node scripts/upsert-trade.js \'{"id":"...","date":"YYYY-MM-DD",...}\'');
process.exit(1);
}
const trade = JSON.parse(input);

let db = { source:'canonical', generatedAt:'', trades:[], journal:[] };
if (fs.existsSync(fp)) db = JSON.parse(fs.readFileSync(fp, 'utf8'));

db.trades = Array.isArray(db.trades) ? db.trades : [];
const id = trade.id || `MAN-${Date.now()}`;
trade.id = id;

const idx = db.trades.findIndex(t => t.id === id);
if (idx >= 0) db.trades[idx] = { ...db.trades[idx], ...trade };
else db.trades.push(trade);

db.generatedAt = new Date().toISOString();
fs.writeFileSync(fp, JSON.stringify(db, null, 2) + '\n');

if (trade.date) {
  try {
    execFileSync('python3', [path.resolve(__dirname, 'generate_chart_snapshots.py'), String(trade.date)], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } catch (err) {
    console.error(`warning: chart snapshot generation failed for ${trade.date}:`, err?.message || err);
  }
}

console.log(`upserted trade ${id}`);
