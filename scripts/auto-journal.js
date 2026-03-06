#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, "data", "trades.json"); // adjust if needed
const STATE_FILE = path.join(ROOT, ".auto-journal-state.json");

function readJson(p) {
return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeJson(p, v) {
fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n", "utf8");
}
function todayStr(d) {
return d.toISOString().slice(0, 10);
}
function num(x) {
return Number(x || 0);
}

function buildJournalEntry(date, dayTrades, existing = {}) {
const grossPnl = dayTrades.reduce((s, t) => s + num(t.pnl), 0);
const commissions = dayTrades.reduce((s, t) => s + num(t.commission), 0);
const netPnl = grossPnl - commissions;
const wins = dayTrades.filter(t => num(t.pnl) > 0).length;
const losses = dayTrades.filter(t => num(t.pnl) < 0).length;
const breakeven = dayTrades.filter(t => num(t.pnl) === 0).length;
const winRate = dayTrades.length ? (wins / dayTrades.length) * 100 : 0;

const best = [...dayTrades].sort((a,b) => num(b.pnl) - num(a.pnl))[0];
const worst = [...dayTrades].sort((a,b) => num(a.pnl) - num(b.pnl))[0];

const titleDate = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
weekday: "long", month: "long", day: "numeric", year: "numeric"
});

const content = [
`Session summary: ${dayTrades.length} trades logged.`,
`Gross PnL ${grossPnl.toFixed(2)}, commissions ${commissions.toFixed(2)}, net PnL ${netPnl.toFixed(2)}.`,
`Win/Loss/BE = ${wins}/${losses}/${breakeven} (Winrate ${winRate.toFixed(1)}%).`,
best ? `Best trade: ${best.id} (${best.symbol}) ${num(best.pnl).toFixed(2)}.` : null,
worst ? `Worst trade: ${worst.id} (${worst.symbol}) ${num(worst.pnl).toFixed(2)}.` : null,
].filter(Boolean).join(" ");

return {
date,
title: `Trading Journal — ${titleDate}`,
mood: existing.mood || "Process-focused.",
setupContext: existing.setupContext || "Auto-generated from latest trade logs.",
execution: existing.execution || "Entries updated automatically from imported trades.",
psychology: existing.psychology || "Review emotional quality manually post-session.",
ruleAdherence: existing.ruleAdherence || "Check stop/entry discipline vs plan.",
whatWentWell: existing.whatWentWell || "Kept logs current and structured.",
whatToImprove: existing.whatToImprove || "Refine setup filter and timing quality.",
lessonLearned: existing.lessonLearned || "Consistency in process beats random outcome.",
nextRule: existing.nextRule || "No full confirmation, no trade.",
ouraSleepScore: existing.ouraSleepScore ?? null,
ouraReadinessScore: existing.ouraReadinessScore ?? null,
content
};
}

function runGit(msg) {
execSync(`git add .`, { stdio: "inherit" });
try {
execSync(`git commit -m "${msg.replace(/"/g, "'")}"`, { stdio: "inherit" });
} catch {
// no changes
return false;
}
execSync(`git push`, { stdio: "inherit" });
return true;
}

function main() {
if (!fs.existsSync(DATA_FILE)) {
throw new Error(`Missing data file: ${DATA_FILE}`);
}

const db = readJson(DATA_FILE);
db.trades = Array.isArray(db.trades) ? db.trades : [];
db.journal = Array.isArray(db.journal) ? db.journal : [];

const state = fs.existsSync(STATE_FILE) ? readJson(STATE_FILE) : { seenTradeIds: [] };
const seen = new Set(state.seenTradeIds || []);

const newTrades = db.trades.filter(t => t?.id && !seen.has(t.id));
if (!newTrades.length) {console.log("No new trades. Exit.");
return;
}

// process only affected dates
const affectedDates = [...new Set(newTrades.map(t => t.date).filter(Boolean))];

for (const date of affectedDates) {
const dayTrades = db.trades.filter(t => t.date === date);
const idx = db.journal.findIndex(j => j.date === date);
const existing = idx >= 0 ? db.journal[idx] : {};
const updated = buildJournalEntry(date, dayTrades, existing);

if (idx >= 0) db.journal[idx] = { ...existing, ...updated };
else db.journal.push(updated);
}

// sort journals desc
db.journal.sort((a,b) => (a.date < b.date ? 1 : -1));

writeJson(DATA_FILE, db);

// update state
for (const t of db.trades) if (t?.id) seen.add(t.id);
writeJson(STATE_FILE, { seenTradeIds: [...seen] });

const pushed = runGit(`chore(journal): auto-update journal for ${affectedDates.join(", ")}`);
console.log(pushed ? "Committed + pushed." : "No git changes to commit.");
}

main();

