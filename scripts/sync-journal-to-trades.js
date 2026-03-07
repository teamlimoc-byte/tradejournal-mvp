#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const tradesFp = path.resolve(__dirname, '..', 'data', 'trades.json');
const journalFp = path.resolve(__dirname, '..', 'data', 'journal.json');

if (!fs.existsSync(tradesFp)) {
  console.error('Missing data/trades.json');
  process.exit(1);
}
if (!fs.existsSync(journalFp)) {
  console.error('Missing data/journal.json');
  process.exit(1);
}

const tradesDb = JSON.parse(fs.readFileSync(tradesFp, 'utf8'));
const journalDb = JSON.parse(fs.readFileSync(journalFp, 'utf8'));

const entries = Array.isArray(journalDb.entries) ? journalDb.entries : [];

const mapped = entries.map((e) => ({
  date: e.date,
  title: e.title || 'Journal Entry',
  mood: e.mood || null,
  content: e.content || e.text || e.summary || '',
  setupContext: e.setupContext || '',
  execution: e.execution || '',
  psychology: e.psychology || '',
  ruleAdherence: e.ruleAdherence || '',
  whatWentWell: e.whatWentWell || e.whatIDidGood || '',
  whatToImprove: e.whatToImprove || '',
  lessonLearned: e.lessonLearned || '',
  nextRule: e.nextRule || e.nextTradeRule || '',
  ouraSleepScore: e.ouraSleepScore ?? null,
  ouraReadinessScore: e.ouraReadinessScore ?? null
})).sort((a,b)=> String(a.date).localeCompare(String(b.date)));

tradesDb.journal = mapped;
tradesDb.updatedAt = new Date().toISOString();

fs.writeFileSync(tradesFp, JSON.stringify(tradesDb, null, 2));
console.log(`synced ${mapped.length} journal entries into data/trades.json (journal[])`);
